import * as Location from 'expo-location';
import { Platform, Alert, Linking } from 'react-native';

export type GpsAccuracyQuality = 'HIGH' | 'FAIR' | 'POOR' | 'UNAVAILABLE';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  altitude?: number | null;
  heading?: number | null;
  speed?: number | null;
  address?: string;
  googleMapsUrl?: string;
  timestamp?: string;
  isLive?: boolean;
  isStale?: boolean;
  isUnavailable?: boolean;
  accuracyQuality?: GpsAccuracyQuality;
  ageSeconds?: number;
}

export interface GpsStatus {
  isAvailable: boolean;
  hasPermission: boolean;
  accuracyQuality: GpsAccuracyQuality;
  accuracyMeters?: number | null;
  isStale: boolean;
  lastFixTimestamp?: string;
  lastKnownLocation?: LocationData | null;
  errorMessage?: string;
}

export const LocationService = {
  async requestPermissions(explainFirst = true): Promise<boolean> {
    try {
      const { status: existingStatus, canAskAgain } = await Location.getForegroundPermissionsAsync();
      if (existingStatus === 'granted') return true;

      if (!canAskAgain) {
        Alert.alert(
          'Location Permission Required',
          'SafeLink requires precise GPS access to locate you during an emergency and send your coordinates to your emergency contacts.\n\nPlease enable Location permissions in device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return false;
      }

      if (explainFirst) {
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Emergency Location Access',
            'SafeLink requires device location permission to calculate your exact GPS coordinates and transmit them to your trusted contacts during distress alerts.',
            [
              { text: 'Not Now', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continue', onPress: () => resolve(true) }
            ]
          );
        });
        if (!proceed) return false;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === 'granted';
    } catch (err) {
      console.warn('[LocationService] Permission request failed:', err);
      return false;
    }
  },

  async hasPermissions(): Promise<boolean> {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  },

  async isGpsProviderEnabled(): Promise<boolean> {
    try {
      return await Location.hasServicesEnabledAsync();
    } catch {
      return false;
    }
  },

  async requestEnableLocationServices(): Promise<boolean> {
    try {
      const enabled = await Location.hasServicesEnabledAsync();
      if (enabled) return true;

      // On Android, invoke native Google Play Services location settings dialog
      if (Platform.OS === 'android') {
        try {
          await Location.enableNetworkProviderAsync();
          const isNowEnabled = await Location.hasServicesEnabledAsync();
          if (isNowEnabled) return true;
        } catch (err: any) {
          console.warn('[LocationService] enableNetworkProviderAsync canceled or rejected:', err);
        }
      }

      // If still disabled or user dismissed native prompt, show clear Alert with Open Settings
      return new Promise((resolve) => {
        Alert.alert(
          'Location Services are Switched OFF',
          'SafeLink requires device Location (GPS) to track your position and broadcast coordinates during an emergency SOS.\n\nPlease turn ON Location in your device settings.',
          [
            {
              text: 'Not Now',
              style: 'cancel',
              onPress: () => resolve(false),
            },
            {
              text: 'Turn On Location',
              onPress: async () => {
                try {
                  if (Platform.OS === 'android') {
                    try {
                      await Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
                    } catch {
                      await Linking.openSettings();
                    }
                  } else {
                    await Linking.openSettings();
                  }
                } catch (linkErr) {
                  console.warn('[LocationService] Open settings error:', linkErr);
                  await Linking.openSettings().catch(() => {});
                }
                const finalCheck = await Location.hasServicesEnabledAsync();
                resolve(finalCheck);
              },
            },
          ]
        );
      });
    } catch (e) {
      console.warn('[LocationService] requestEnableLocationServices error:', e);
      return false;
    }
  },

  calculateAccuracyQuality(accuracy?: number | null): GpsAccuracyQuality {
    if (accuracy == null || accuracy <= 0) return 'UNAVAILABLE';
    if (accuracy <= 25) return 'HIGH';
    if (accuracy <= 70) return 'FAIR';
    return 'POOR';
  },

  formatAccuracyLabel(accuracy?: number | null): string {
    if (accuracy == null) return 'Unknown';
    const quality = this.calculateAccuracyQuality(accuracy);
    const m = Math.round(accuracy);
    if (quality === 'HIGH') return `±${m}m (High)`;
    if (quality === 'FAIR') return `±${m}m (Fair)`;
    return `±${m}m (Poor)`;
  },

  async checkGpsStatus(): Promise<GpsStatus> {
    const isAvailable = await this.isGpsProviderEnabled();
    const hasPermission = await this.hasPermissions();

    if (!isAvailable) {
      return {
        isAvailable: false,
        hasPermission,
        accuracyQuality: 'UNAVAILABLE',
        isStale: true,
        errorMessage: 'Location services disabled on device.',
      };
    }

    if (!hasPermission) {
      return {
        isAvailable: true,
        hasPermission: false,
        accuracyQuality: 'UNAVAILABLE',
        isStale: true,
        errorMessage: 'Location permission not granted.',
      };
    }

    try {
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (!lastKnown) {
        return {
          isAvailable: true,
          hasPermission: true,
          accuracyQuality: 'UNAVAILABLE',
          isStale: true,
          errorMessage: 'No prior GPS fix available.',
        };
      }

      const ageMs = Date.now() - lastKnown.timestamp;
      const ageSecs = Math.floor(ageMs / 1000);
      const isStale = ageSecs > 120; // older than 2 minutes
      const accuracy = lastKnown.coords.accuracy;
      const quality = this.calculateAccuracyQuality(accuracy);

      const locData: LocationData = {
        latitude: lastKnown.coords.latitude,
        longitude: lastKnown.coords.longitude,
        accuracy: accuracy,
        altitude: lastKnown.coords.altitude,
        heading: lastKnown.coords.heading,
        speed: lastKnown.coords.speed,
        googleMapsUrl: this.generateGoogleMapsLink(lastKnown.coords.latitude, lastKnown.coords.longitude),
        timestamp: new Date(lastKnown.timestamp).toISOString(),
        isLive: !isStale,
        isStale: isStale,
        accuracyQuality: quality,
        ageSeconds: ageSecs,
      };

      return {
        isAvailable: true,
        hasPermission: true,
        accuracyQuality: quality,
        accuracyMeters: accuracy,
        isStale: isStale,
        lastFixTimestamp: locData.timestamp,
        lastKnownLocation: locData,
      };
    } catch (err: any) {
      return {
        isAvailable: true,
        hasPermission: true,
        accuracyQuality: 'UNAVAILABLE',
        isStale: true,
        errorMessage: err?.message || 'Error checking GPS fix',
      };
    }
  },

  async getLastKnownLocation(): Promise<LocationData | null> {
    try {
      const last = await Location.getLastKnownPositionAsync();
      if (!last) return null;
      const ageSecs = Math.floor((Date.now() - last.timestamp) / 1000);
      const isStale = ageSecs > 120;
      return {
        latitude: last.coords.latitude,
        longitude: last.coords.longitude,
        accuracy: last.coords.accuracy,
        altitude: last.coords.altitude,
        heading: last.coords.heading,
        speed: last.coords.speed,
        googleMapsUrl: this.generateGoogleMapsLink(last.coords.latitude, last.coords.longitude),
        timestamp: new Date(last.timestamp).toISOString(),
        isLive: !isStale,
        isStale,
        accuracyQuality: this.calculateAccuracyQuality(last.coords.accuracy),
        ageSeconds: ageSecs,
      };
    } catch {
      return null;
    }
  },

  async getCurrentLocation(promptIfDisabled: boolean = true): Promise<LocationData> {
    const granted = await this.hasPermissions();
    if (!granted) {
      const req = await this.requestPermissions(promptIfDisabled);
      if (!req) {
        return {
          latitude: 0,
          longitude: 0,
          accuracy: null,
          address: 'Location unavailable (Permission denied)',
          isLive: false,
          isStale: false,
          isUnavailable: true,
          accuracyQuality: 'UNAVAILABLE',
          timestamp: new Date().toISOString(),
        };
      }
    }

    let providerEnabled = await this.isGpsProviderEnabled();
    if (!providerEnabled) {
      if (promptIfDisabled) {
        // Explicitly prompt the user to turn on GPS / Location Services!
        await this.requestEnableLocationServices();
        providerEnabled = await this.isGpsProviderEnabled();
      }

      if (!providerEnabled) {
        // When GPS is disabled, return explicit unavailable status instead of stale or fake coords
        return {
          latitude: 0,
          longitude: 0,
          accuracy: null,
          address: 'Location unavailable (GPS disabled)',
          isLive: false,
          isStale: false,
          isUnavailable: true,
          accuracyQuality: 'UNAVAILABLE',
          timestamp: new Date().toISOString(),
        };
      }
    }

    try {
      // High accuracy real GPS location
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const gmapsUrl = this.generateGoogleMapsLink(lat, lng);

      // Reverse geocode to get readable street address
      let formattedAddress = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      try {
        const addresses = await Location.reverseGeocodeAsync({
          latitude: lat,
          longitude: lng,
        });
        if (addresses && addresses.length > 0) {
          const a = addresses[0];
          const parts = [
            a.name,
            a.street,
            a.district,
            a.city || a.subregion,
            a.region,
            a.postalCode
          ].filter(Boolean);
          if (parts.length > 0) {
            formattedAddress = parts.join(', ');
          }
        }
      } catch (geoErr) {
        console.warn('[LocationService] Reverse geocode notice:', geoErr);
      }

      const quality = this.calculateAccuracyQuality(pos.coords.accuracy);

      return {
        latitude: lat,
        longitude: lng,
        accuracy: pos.coords.accuracy,
        altitude: pos.coords.altitude,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
        address: formattedAddress,
        googleMapsUrl: gmapsUrl,
        timestamp: new Date(pos.timestamp).toISOString(),
        isLive: true,
        isStale: false,
        isUnavailable: false,
        accuracyQuality: quality,
        ageSeconds: 0,
      };
    } catch (err: any) {
      console.warn('[LocationService] Live GPS fetch failed:', err?.message);
      return {
        latitude: 0,
        longitude: 0,
        accuracy: null,
        address: 'Location unavailable (GPS signal not found)',
        isLive: false,
        isStale: false,
        isUnavailable: true,
        accuracyQuality: 'UNAVAILABLE',
        timestamp: new Date().toISOString(),
      };
    }
  },

  generateGoogleMapsLink(latitude: number, longitude: number): string {
    return `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  }
};
