import * as Location from 'expo-location';

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
}

export const LocationService = {
  async requestPermissions(): Promise<boolean> {
    try {
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

  async getCurrentLocation(): Promise<LocationData> {
    const granted = await this.hasPermissions();
    if (!granted) {
      const req = await this.requestPermissions();
      if (!req) {
        throw new Error('Location permission is denied. SafeLink requires GPS access for live emergency safeguards.');
      }
    }

    // High accuracy real GPS location
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const gmapsUrl = `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;

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
    };
  },

  generateGoogleMapsLink(latitude: number, longitude: number): string {
    return `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  }
};
