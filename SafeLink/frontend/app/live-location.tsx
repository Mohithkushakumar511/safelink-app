import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { SafeLinkMapView } from '@/components/MapView';
import { Colors } from '@/constants/colors';
import { LocationService, LocationData } from '@/services/location';
import { api, formatApiError } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';

export default function LiveLocationScreen() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [location, setLocation] = useState<LocationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLiveSharing, setIsLiveSharing] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const fetchLocation = async (syncBackend = true) => {
    setIsLoading(true);
    try {
      const loc = await LocationService.getCurrentLocation();
      setLocation(loc);
      setHasPermission(true);

      if (syncBackend && isAuthenticated && !authLoading) {
        api.location.update({
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracy: loc.accuracy || undefined,
          altitude: loc.altitude || undefined,
          heading: loc.heading || undefined,
          speed: loc.speed || undefined,
          address: loc.address,
          is_live_sharing: isLiveSharing,
        }).catch((e) => console.warn('[LiveLocation] Sync notice:', e));
      }
    } catch (err: any) {
      console.warn('[LiveLocation] Fetch error:', err);
      if (err.message && (err.message.includes('permission') || err.message.includes('Location'))) {
        setHasPermission(false);
        Alert.alert('GPS Location', err.message || 'Unable to retrieve location fix.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLocation();
  }, []);

  // Periodic updates when Live Sharing is active
  useEffect(() => {
    let interval: any = null;
    if (isLiveSharing) {
      interval = setInterval(() => {
        fetchLocation(true);
      }, 10000); // 10s interval
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLiveSharing]);

  const toggleLiveSharing = () => {
    const nextState = !isLiveSharing;
    setIsLiveSharing(nextState);
    if (location) {
      api.location.update({
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy || undefined,
        address: location.address,
        is_live_sharing: nextState,
      }).catch((e) => console.warn('Sync live state notice:', e));
    }
  };

  const handleShareLink = async () => {
    if (!location) return;
    try {
      await Share.share({
        title: 'SafeLink Live Coordinates',
        message: `My current GPS location is: ${location.googleMapsUrl}`,
      });
    } catch (e: any) {
      Alert.alert('Share Error', e.message);
    }
  };

  return (
    <ScreenWrapper scrollable activeTab="location" contentContainerStyle={styles.container}>
      {/* ------------------------------------------------------------- */}
      {/* SCREEN HEADER */}
      {/* ------------------------------------------------------------- */}
      <View style={styles.screenHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Live GPS Location</Text>
          <Text style={styles.headerSub}>
            Real-time coordinates mapped via Mapbox & device sensors
          </Text>
        </View>

        <Badge
          label={isLiveSharing ? 'LIVE SHARING ON' : 'STANDBY'}
          variant={isLiveSharing ? 'success' : 'info'}
        />
      </View>

      {/* ------------------------------------------------------------- */}
      {/* INTERACTIVE MAP CONTAINER */}
      {/* ------------------------------------------------------------- */}
      <View style={styles.mapContainer}>
        {location ? (
          <SafeLinkMapView
            latitude={location.latitude}
            longitude={location.longitude}
            accuracy={location.accuracy}
            markerTitle="My Current Position"
            zoom={16}
            style={styles.mapView}
          />
        ) : (
          <View style={styles.loadingMapBox}>
            <ActivityIndicator size="large" color={Colors.infoBlue} />
            <Text style={styles.loadingMapText}>Connecting to GPS Satellites...</Text>
          </View>
        )}

        {/* Floating Quick Action Overlay */}
        <View style={styles.mapOverlayHeader}>
          <View style={styles.mapStatusPill}>
            <View
              style={[
                styles.mapStatusDot,
                { backgroundColor: location ? Colors.safetyGreen : Colors.warningAmber },
              ]}
            />
            <Text style={styles.mapStatusPillText}>
              {location ? 'High-Accuracy Satellite Fix' : 'Locating...'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.mapRefreshCircle}
            onPress={() => fetchLocation(true)}
            disabled={isLoading}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isLoading ? 'reload-circle' : 'locate'}
              size={18}
              color={Colors.infoBlue}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* ------------------------------------------------------------- */}
      {/* GPS TELEMETRY & COORDINATES CARD */}
      {/* ------------------------------------------------------------- */}
      <Card style={styles.telemetryCard}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="navigate-circle" size={20} color={Colors.infoBlue} />
            <Text style={styles.cardHeading}>Current Coordinates & Fix</Text>
          </View>
          <Badge
            label={hasPermission ? 'SIGNAL ACTIVE' : 'PERMISSIONS NEEDED'}
            variant={hasPermission ? 'success' : 'danger'}
          />
        </View>

        {/* Formatted Street Address */}
        <View style={styles.addressBox}>
          <Ionicons name="business-outline" size={17} color={Colors.textMuted} style={{ marginTop: 2 }} />
          <Text style={styles.addressText}>
            {location ? location.address : 'Acquiring reverse geocoded address...'}
          </Text>
        </View>

        {/* 4 Telemetry Numbers Grid */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>LATITUDE</Text>
            <Text style={styles.metricVal}>
              {location ? location.latitude.toFixed(6) : '--'}
            </Text>
          </View>

          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>LONGITUDE</Text>
            <Text style={styles.metricVal}>
              {location ? location.longitude.toFixed(6) : '--'}
            </Text>
          </View>

          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>ACCURACY</Text>
            <Text style={styles.metricVal}>
              {location?.accuracy ? `±${Math.round(location.accuracy)} m` : '--'}
            </Text>
          </View>

          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>INTERVAL</Text>
            <Text style={[styles.metricVal, { color: isLiveSharing ? Colors.safetyGreen : Colors.textMuted }]}>
              {isLiveSharing ? '10 SECS' : 'MANUAL'}
            </Text>
          </View>
        </View>

        {/* Action Controls */}
        <View style={styles.buttonActionsRow}>
          <Button
            title="Refresh GPS"
            onPress={() => fetchLocation(true)}
            variant="secondary"
            size="sm"
            loading={isLoading}
            style={{ flex: 1, marginRight: 6 }}
            leftIcon={<Ionicons name="refresh" size={15} color={Colors.textPrimary} />}
          />
          <Button
            title={isLiveSharing ? 'Stop Live Sharing' : 'Start Live Sharing'}
            onPress={toggleLiveSharing}
            variant={isLiveSharing ? 'danger' : 'primary'}
            size="sm"
            style={{ flex: 1, marginLeft: 6 }}
            leftIcon={<Ionicons name={isLiveSharing ? 'pause' : 'radio'} size={15} color="#FFFFFF" />}
          />
        </View>
      </Card>

      {/* ------------------------------------------------------------- */}
      {/* SHAREABLE LINK CARD */}
      {/* ------------------------------------------------------------- */}
      <Card style={styles.shareCard}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="share-social-outline" size={18} color={Colors.safetyGreen} />
            <Text style={styles.cardHeading}>Emergency Location Link</Text>
          </View>
        </View>

        <Text style={styles.shareHelpText}>
          Share this direct Google Maps link with trusted family, medical personnel, or first responders:
        </Text>

        <View style={styles.shareUrlContainer}>
          <Text style={styles.shareUrlText} numberOfLines={1}>
            {location ? location.googleMapsUrl : 'Location URL pending GPS fix...'}
          </Text>
        </View>

        <Button
          title="Share via SMS / WhatsApp"
          onPress={handleShareLink}
          variant="outline"
          size="md"
          disabled={!location}
          style={{ marginTop: 12 }}
          leftIcon={<Ionicons name="paper-plane-outline" size={16} color={Colors.infoBlue} />}
        />
      </Card>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
  },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  headerSub: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  /* Map View */
  mapContainer: {
    height: 270,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#1E356D',
    position: 'relative',
    marginBottom: 16,
    backgroundColor: '#0F1D3D',
  },
  mapView: {
    flex: 1,
  },
  loadingMapBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingMapText: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 10,
    fontWeight: '600',
  },
  mapOverlayHeader: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mapStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10, 17, 40, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E356D',
  },
  mapStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  mapStatusPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  mapRefreshCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(10, 17, 40, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1E356D',
  },
  /* Telemetry Card */
  telemetryCard: {
    padding: 16,
    backgroundColor: '#101F42',
    borderColor: '#1E356D',
    marginBottom: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardHeading: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 6,
  },
  addressBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0A142D',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  addressText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
    lineHeight: 18,
  },
  metricsGrid: {
    flexDirection: 'row',
    backgroundColor: '#0A142D',
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  metricVal: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  buttonActionsRow: {
    flexDirection: 'row',
  },
  /* Share Card */
  shareCard: {
    padding: 16,
    backgroundColor: '#101F42',
    borderColor: '#1E356D',
    marginBottom: 20,
  },
  shareHelpText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  shareUrlContainer: {
    backgroundColor: '#0A142D',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#172554',
  },
  shareUrlText: {
    color: Colors.infoBlue,
    fontSize: 12,
    fontWeight: '600',
  },
});
