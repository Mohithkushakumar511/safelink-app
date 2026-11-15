import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { SafeLinkMapView } from '@/components/MapView';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/hooks/useAuth';
import { LocationService, LocationData } from '@/services/location';
import { SosDispatchService } from '@/services/sos';
import { DirectSmsService, SmsDispatchResult } from '@/services/sms';
import { api, formatApiError } from '@/services/api';

export default function SosTrackingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [incident, setIncident] = useState<any | null>(null);
  const [currentLoc, setCurrentLoc] = useState<LocationData | null>(null);
  const [defaultContact, setDefaultContact] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUpdatingLoc, setIsUpdatingLoc] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);

  const trackingTimerRef = useRef<any>(null);

  // Load Incident Data & Default Contact
  const loadIncidentData = async () => {
    if (!isAuthenticated || authLoading) return;
    try {
      // 1. Fetch default emergency contact
      try {
        const def = await api.contacts.getDefault();
        setDefaultContact(def);
      } catch (cErr) {
        console.warn('[SOS Tracking] Default contact fetch notice:', cErr);
      }

      // 2. Fetch incident: check params first, then active
      let targetIncident: any = null;
      if (params.id) {
        targetIncident = await api.sos.getIncident(params.id as string);
      } else {
        targetIncident = await api.sos.getActive();
      }

      if (targetIncident) {
        setIncident(targetIncident);
        if (targetIncident.latest_location) {
          setCurrentLoc({
            latitude: targetIncident.latest_location.latitude,
            longitude: targetIncident.latest_location.longitude,
            accuracy: targetIncident.latest_location.accuracy,
            address: targetIncident.latest_location.address,
            googleMapsUrl: targetIncident.google_maps_url,
          });
        }
      }
    } catch (err: any) {
      console.warn('[SOS Tracking] Load error:', err);
      setIsOffline(true);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!authLoading) {
        if (!isAuthenticated) {
          router.replace('/login');
        } else {
          loadIncidentData();
        }
      }
    }, [authLoading, isAuthenticated, params.id])
  );

  // Periodic GPS tracking while incident is ACTIVE
  const pushLocationUpdate = async () => {
    if (!incident || incident.status !== 'ACTIVE') return;
    setIsUpdatingLoc(true);

    let freshLoc: LocationData | null = null;
    try {
      freshLoc = await LocationService.getCurrentLocation();
      setCurrentLoc(freshLoc);
      setIsOffline(false);
    } catch (locErr) {
      console.warn('[SOS Tracking] Local GPS error:', locErr);
      setIsUpdatingLoc(false);
      return;
    }

    try {
      const updated = await api.sos.updateLocation(
        incident.incident_id || incident.id,
        {
          latitude: freshLoc.latitude,
          longitude: freshLoc.longitude,
          accuracy: freshLoc.accuracy || undefined,
          address: freshLoc.address,
        }
      );
      setIncident(updated);
    } catch (netErr) {
      console.warn('[SOS Tracking] Network update error:', netErr);
      setIsOffline(true);
    } finally {
      setIsUpdatingLoc(false);
    }
  };

  useEffect(() => {
    if (incident && incident.status === 'ACTIVE') {
      // Immediate update
      pushLocationUpdate();
      // Setup 10-second interval
      trackingTimerRef.current = setInterval(() => {
        pushLocationUpdate();
      }, 10000);
    } else {
      if (trackingTimerRef.current) clearInterval(trackingTimerRef.current);
    }

    return () => {
      if (trackingTimerRef.current) clearInterval(trackingTimerRef.current);
    };
  }, [incident?.status, incident?.incident_id]);

  // Dispatch Native SMS with Direct Sending & Accurate Status Tracking
  const handleSendSMS = async () => {
    if (!incident) return;
    const phone = incident.primary_contact_phone || defaultContact?.phone;
    if (!phone) {
      Alert.alert('No Contact Phone', 'Please add an emergency contact phone number in Contacts.');
      return;
    }

    const userName = user?.name || user?.display_name || 'SafeLink User';
    const locUrl = currentLoc?.googleMapsUrl || incident.google_maps_url;
    const isLastKnown = isOffline || !currentLoc;
    const msg = SosDispatchService.buildEmergencyMessage(
      userName,
      incident.incident_id || incident.id,
      new Date(incident.activated_at || incident.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      locUrl,
      isLastKnown,
      incident.emergency_description || undefined
    );

    try {
      const smsResult: SmsDispatchResult = await DirectSmsService.sendEmergencySms(phone, msg);

      // Save sending attempt and accurate status in backend (Features 3 & 5)
      await api.sos.updateMessageStatus(incident.incident_id || incident.id, {
        recipient_contact_id: incident.default_contact_id,
        recipient_name: incident.primary_contact_name || defaultContact?.name,
        recipient_phone: phone,
        message_content: msg,
        sending_method: smsResult.method,
        sending_status: smsResult.status,
        delivery_confirmation: smsResult.deliveryConfirmation,
        submitted_at: smsResult.timestamp,
      });

      // Update incident state locally
      setIncident((prev: any) =>
        prev
          ? {
              ...prev,
              recipient_info: {
                ...prev.recipient_info,
                sending_status: smsResult.status,
                sending_method: smsResult.method,
                delivery_confirmation: smsResult.deliveryConfirmation,
              },
            }
          : prev
      );

      if (smsResult.status === 'SENT') {
        Alert.alert('SMS Transmitted', `Emergency alert sent directly via cellular to ${phone}.`);
      }
    } catch (err: any) {
      Alert.alert('SMS Dispatch Notice', err.message || 'Emergency SMS could not be dispatched.');
    }
  };

  // Dispatch WhatsApp
  const handleSendWhatsApp = async () => {
    if (!incident) return;
    const phone = incident.primary_contact_phone || defaultContact?.phone;
    if (!phone) {
      Alert.alert('No Contact Phone', 'Please add an emergency contact phone number in Contacts.');
      return;
    }

    const userName = user?.name || user?.display_name || 'SafeLink User';
    const locUrl = currentLoc?.googleMapsUrl || incident.google_maps_url;
    const isLastKnown = isOffline || !currentLoc;
    const msg = SosDispatchService.buildEmergencyMessage(
      userName,
      incident.incident_id || incident.id,
      new Date(incident.activated_at || incident.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      locUrl,
      isLastKnown
    );

    const ok = await SosDispatchService.openWhatsApp(phone, msg);
    if (!ok) {
      Alert.alert('Notice', 'Could not open WhatsApp. Launching SMS composer instead.');
      await SosDispatchService.openNativeSMS(phone, msg);
    }
  };

  // Phone Call
  const handleCallContact = () => {
    const phone = incident?.primary_contact_phone || defaultContact?.phone;
    if (!phone) {
      Alert.alert('No Phone Number', 'No phone number available for this contact.');
      return;
    }
    const clean = phone.replace(/[^\d+]/g, '');
    require('react-native').Linking.openURL(`tel:${clean}`);
  };

  // Cancel SOS
  const handleCancelSOS = () => {
    if (!incident) return;
    Alert.alert(
      'Cancel SOS Emergency',
      'Are you safe? This will cancel the active incident and stop real-time GPS tracking.',
      [
        { text: 'Keep Active', style: 'cancel' },
        {
          text: 'Yes, Cancel SOS',
          style: 'destructive',
          onPress: async () => {
            setIsProcessingAction(true);
            try {
              const res = await api.sos.cancel(
                incident.incident_id || incident.id,
                'Cancelled by user (Accidental activation / False alarm)'
              );
              setIncident(res);
              if (trackingTimerRef.current) clearInterval(trackingTimerRef.current);

              // Prompt to notify emergency contact of cancellation
              const phone = res.primary_contact_phone || defaultContact?.phone;
              if (phone) {
                Alert.alert(
                  'Notify Contact',
                  `Would you like to send a cancellation update message to ${res.primary_contact_name || 'your emergency contact'}?`,
                  [
                    { text: 'Skip', style: 'cancel' },
                    {
                      text: 'Send Update SMS',
                      onPress: async () => {
                        const userName = user?.name || user?.display_name || 'SafeLink User';
                        const cancelMsg = SosDispatchService.buildCancellationMessage(
                          userName,
                          res.incident_id || res.id,
                          'False alarm / I am safe'
                        );
                        await SosDispatchService.openNativeSMS(phone, cancelMsg);
                      },
                    },
                  ]
                );
              }
            } catch (err: any) {
              Alert.alert('Error', formatApiError(err));
            } finally {
              setIsProcessingAction(false);
            }
          },
        },
      ]
    );
  };

  // Mark Resolved
  const handleResolveSOS = () => {
    if (!incident) return;
    Alert.alert(
      'Mark Emergency as Resolved',
      'Has the emergency situation been resolved safely? This will record resolution and conclude active tracking.',
      [
        { text: 'Keep Active', style: 'cancel' },
        {
          text: 'Mark Resolved',
          onPress: async () => {
            setIsProcessingAction(true);
            try {
              const res = await api.sos.resolve(
                incident.incident_id || incident.id,
                'Situation safely resolved by user'
              );
              setIncident(res);
              if (trackingTimerRef.current) clearInterval(trackingTimerRef.current);

              // Prompt to notify emergency contact of safe resolution
              const phone = res.primary_contact_phone || defaultContact?.phone;
              if (phone) {
                Alert.alert(
                  'Notify Contact',
                  `Would you like to send a safe resolution update to ${res.primary_contact_name || 'your emergency contact'}?`,
                  [
                    { text: 'Skip', style: 'cancel' },
                    {
                      text: 'Send Resolution SMS',
                      onPress: async () => {
                        const userName = user?.name || user?.display_name || 'SafeLink User';
                        const resolveMsg = SosDispatchService.buildResolutionMessage(
                          userName,
                          res.incident_id || res.id,
                          'Situation safely resolved'
                        );
                        await SosDispatchService.openNativeSMS(phone, resolveMsg);
                      },
                    },
                  ]
                );
              }
            } catch (err: any) {
              Alert.alert('Error', formatApiError(err));
            } finally {
              setIsProcessingAction(false);
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <ScreenWrapper style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.emergencyRedBright} />
        <Text style={styles.loadingText}>Loading Incident Telemetry...</Text>
      </ScreenWrapper>
    );
  }

  if (!incident) {
    return (
      <ScreenWrapper style={styles.centerContainer}>
        <View style={styles.noActiveIconCircle}>
          <Ionicons name="shield-checkmark" size={54} color={Colors.safetyGreen} />
        </View>
        <Text style={styles.noActiveTitle}>No Active Emergency</Text>
        <Text style={styles.noActiveSub}>
          You do not have any currently active SOS incidents. All systems are secure.
        </Text>
        <Button
          title="Return to Dashboard"
          onPress={() => router.replace('/dashboard')}
          variant="primary"
          size="md"
          style={{ marginTop: 20 }}
          leftIcon={<Ionicons name="home" size={16} color="#FFFFFF" />}
        />
        <Button
          title="View Incident History"
          onPress={() => router.push('/history')}
          variant="outline"
          size="md"
          style={{ marginTop: 10 }}
          leftIcon={<Ionicons name="time-outline" size={16} color={Colors.infoBlue} />}
        />
      </ScreenWrapper>
    );
  }

  const isActive = incident.status === 'ACTIVE';
  const isResolved = incident.status === 'RESOLVED';
  const isCancelled = incident.status === 'CANCELLED';

  const statusVariant = isActive ? 'danger' : isResolved ? 'success' : 'warning';
  const locHistoryCount = incident.location_history?.length || 1;

  return (
    <ScreenWrapper scrollable contentContainerStyle={styles.container}>
      {/* ------------------------------------------------------------- */}
      {/* INCIDENT STATUS HEADER BANNER */}
      {/* ------------------------------------------------------------- */}
      <View
        style={[
          styles.statusBanner,
          isActive && styles.statusBannerActive,
          isResolved && styles.statusBannerResolved,
          isCancelled && styles.statusBannerCancelled,
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={[
              styles.beaconDot,
              {
                backgroundColor: isActive
                  ? Colors.emergencyRedBright
                  : isResolved
                  ? Colors.safetyGreen
                  : Colors.warningAmber,
              },
            ]}
          />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.bannerStatusText}>
              {isActive ? 'EMERGENCY SOS ACTIVE' : isResolved ? 'INCIDENT RESOLVED' : 'INCIDENT CANCELLED'}
            </Text>
            <Text style={styles.bannerIncidentCode}>
              Incident #{incident.incident_id || incident.id}
            </Text>
          </View>
          <Badge label={incident.status} variant={statusVariant} />
        </View>

        {isOffline && (
          <View style={styles.offlineWarningPill}>
            <Ionicons name="cloud-offline" size={13} color="#F59E0B" />
            <Text style={styles.offlineWarningText}>
              Offline mode: Showing latest available satellite fix
            </Text>
          </View>
        )}
      </View>

      {/* ------------------------------------------------------------- */}
      {/* INTERACTIVE MAPVIEW */}
      {/* ------------------------------------------------------------- */}
      <View style={styles.mapContainer}>
        {currentLoc ? (
          <SafeLinkMapView
            latitude={currentLoc.latitude}
            longitude={currentLoc.longitude}
            accuracy={currentLoc.accuracy}
            markerTitle={`SOS: ${incident.incident_id || incident.id}`}
            zoom={16}
            style={styles.mapView}
          />
        ) : (
          <View style={styles.mapPlaceholder}>
            <ActivityIndicator size="large" color={Colors.emergencyRedBright} />
            <Text style={styles.mapPlaceholderText}>Locating Device Coordinates...</Text>
          </View>
        )}

        {/* Live GPS Telemetry Floating Badge */}
        <View style={styles.mapFloatingBadge}>
          <Ionicons
            name={isUpdatingLoc ? 'sync' : 'radio'}
            size={14}
            color={isActive ? Colors.emergencyRedBright : Colors.textMuted}
          />
          <Text style={styles.mapFloatingBadgeText}>
            {isActive
              ? isUpdatingLoc
                ? 'Syncing GPS...'
                : 'Live Tracking Active (10s)'
              : 'Tracking Concluded'}
          </Text>
        </View>
      </View>

      {/* ------------------------------------------------------------- */}
      {/* LOCATION & TELEMETRY DETAILS */}
      {/* ------------------------------------------------------------- */}
      <Card style={styles.infoCard}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="navigate-circle" size={18} color={Colors.infoBlue} />
            <Text style={styles.cardTitle}>GPS Position & Telemetry</Text>
          </View>
          {isActive && (
            <TouchableOpacity
              onPress={pushLocationUpdate}
              disabled={isUpdatingLoc}
              style={{ flexDirection: 'row', alignItems: 'center' }}
            >
              <Ionicons
                name={isUpdatingLoc ? 'reload-circle' : 'refresh'}
                size={16}
                color={Colors.infoBlue}
              />
              <Text style={{ color: Colors.infoBlue, fontSize: 11, fontWeight: '700', marginLeft: 4 }}>
                {isUpdatingLoc ? 'Updating' : 'Ping'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.addressBox}>
          <Ionicons name="location" size={16} color={Colors.emergencyRedBright} style={{ marginTop: 2 }} />
          <Text style={styles.addressText}>
            {currentLoc?.address || incident.address || 'Acquiring reverse geocoded street fix...'}
          </Text>
        </View>

        <View style={styles.telemetryGrid}>
          <View style={styles.telemetryItem}>
            <Text style={styles.telemetryLabel}>LATITUDE</Text>
            <Text style={styles.telemetryVal}>
              {currentLoc?.latitude.toFixed(6) || incident.latitude?.toFixed(6) || '--'}
            </Text>
          </View>
          <View style={styles.telemetryItem}>
            <Text style={styles.telemetryLabel}>LONGITUDE</Text>
            <Text style={styles.telemetryVal}>
              {currentLoc?.longitude.toFixed(6) || incident.longitude?.toFixed(6) || '--'}
            </Text>
          </View>
          <View style={styles.telemetryItem}>
            <Text style={styles.telemetryLabel}>ACCURACY</Text>
            <Text style={styles.telemetryVal}>
              {currentLoc?.accuracy ? `±${Math.round(currentLoc.accuracy)}m` : 'High'}
            </Text>
          </View>
          <View style={styles.telemetryItem}>
            <Text style={styles.telemetryLabel}>BREADCRUMBS</Text>
            <Text style={styles.telemetryVal}>{locHistoryCount} points</Text>
          </View>
        </View>
      </Card>

      {/* ------------------------------------------------------------- */}
      {/* EMERGENCY CONTACT DISPATCHED */}
      {/* ------------------------------------------------------------- */}
      <Card style={styles.infoCard}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="people" size={18} color={Colors.infoBlue} />
            <Text style={styles.cardTitle}>Emergency Contact Notified</Text>
          </View>
          <Badge label="DEFAULT SOS CONTACT" variant="success" />
        </View>

        <View style={styles.contactRow}>
          <View style={styles.contactAvatar}>
            <Ionicons name="person" size={20} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.contactName}>
              {incident.primary_contact_name || defaultContact?.name || 'Emergency Contact'}
            </Text>
            <Text style={styles.contactPhone}>
              {incident.primary_contact_phone || defaultContact?.phone || 'Configured via Contacts'}
            </Text>
          </View>

          {/* Quick Call Action */}
          <TouchableOpacity
            style={styles.callBtn}
            onPress={handleCallContact}
            activeOpacity={0.7}
          >
            <Ionicons name="call" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Messaging Dispatch Buttons */}
        <View style={styles.dispatchActionsRow}>
          <Button
            title="Dispatch SMS"
            onPress={handleSendSMS}
            variant="emergency"
            size="sm"
            style={{ flex: 1, marginRight: 6 }}
            leftIcon={<Ionicons name="chatbubble-ellipses" size={16} color="#FFFFFF" />}
          />
          <Button
            title="Send WhatsApp"
            onPress={handleSendWhatsApp}
            variant="secondary"
            size="sm"
            style={{ flex: 1, marginLeft: 6 }}
            leftIcon={<Ionicons name="logo-whatsapp" size={16} color="#25D366" />}
          />
        </View>
      </Card>

      {/* ------------------------------------------------------------- */}
      {/* TIMESTAMPS & INCIDENT LOG DETAILS */}
      {/* ------------------------------------------------------------- */}
      <Card style={styles.infoCard}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="time" size={18} color={Colors.infoBlue} />
            <Text style={styles.cardTitle}>Incident Details & Audit Log</Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Activated At:</Text>
          <Text style={styles.detailVal}>
            {new Date(incident.activated_at || incident.timestamp).toLocaleString()}
          </Text>
        </View>

        {incident.last_location_update && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Last GPS Ping:</Text>
            <Text style={styles.detailVal}>
              {new Date(incident.last_location_update).toLocaleTimeString()}
            </Text>
          </View>
        )}

        {incident.resolved_at && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Resolved At:</Text>
            <Text style={[styles.detailVal, { color: Colors.safetyGreen }]}>
              {new Date(incident.resolved_at).toLocaleString()}
            </Text>
          </View>
        )}

        {incident.cancelled_at && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Cancelled At:</Text>
            <Text style={[styles.detailVal, { color: Colors.warningAmber }]}>
              {new Date(incident.cancelled_at).toLocaleString()}
            </Text>
          </View>
        )}

        {incident.duration_seconds !== undefined && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Duration:</Text>
            <Text style={styles.detailVal}>
              {Math.floor(incident.duration_seconds / 60)}m {incident.duration_seconds % 60}s
            </Text>
          </View>
        )}
      </Card>

      {/* ------------------------------------------------------------- */}
      {/* BOTTOM ACTIONS: RESOLVE OR CANCEL (If Active) */}
      {/* ------------------------------------------------------------- */}
      {isActive && (
        <View style={styles.bottomControlBar}>
          <Button
            title="MARK RESOLVED"
            onPress={handleResolveSOS}
            variant="primary"
            size="lg"
            loading={isProcessingAction}
            style={{ flex: 1, marginRight: 6 }}
            leftIcon={<Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />}
          />
          <Button
            title="CANCEL SOS"
            onPress={handleCancelSOS}
            variant="danger"
            size="lg"
            loading={isProcessingAction}
            style={{ flex: 1, marginLeft: 6 }}
            leftIcon={<Ionicons name="close-circle" size={20} color="#FFFFFF" />}
          />
        </View>
      )}

      {/* Return to Dashboard Action if Concluded */}
      {!isActive && (
        <Button
          title="Return to Dashboard"
          onPress={() => router.replace('/dashboard')}
          variant="secondary"
          size="md"
          style={{ marginVertical: 14 }}
          leftIcon={<Ionicons name="home" size={16} color={Colors.textPrimary} />}
        />
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: 12,
    fontWeight: '600',
  },
  noActiveIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  noActiveTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  noActiveSub: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 19,
    maxWidth: 280,
  },
  /* Status Banner */
  statusBanner: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
  },
  statusBannerActive: {
    backgroundColor: 'rgba(220, 38, 38, 0.2)',
    borderColor: Colors.emergencyRedBright,
  },
  statusBannerResolved: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: Colors.safetyGreen,
  },
  statusBannerCancelled: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: Colors.warningAmber,
  },
  beaconDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  bannerStatusText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  bannerIncidentCode: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  offlineWarningPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 8,
  },
  offlineWarningText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 5,
  },
  /* Map View */
  mapContainer: {
    height: 250,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#1E356D',
    position: 'relative',
    marginBottom: 14,
    backgroundColor: '#0F1D3D',
  },
  mapView: {
    flex: 1,
  },
  mapPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPlaceholderText: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 8,
  },
  mapFloatingBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10, 17, 40, 0.9)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#1E356D',
  },
  mapFloatingBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 6,
  },
  /* Card Styling */
  infoCard: {
    padding: 14,
    backgroundColor: '#101F42',
    borderColor: '#1E356D',
    marginBottom: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 6,
  },
  addressBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0A142D',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  addressText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    flex: 1,
    marginLeft: 6,
  },
  telemetryGrid: {
    flexDirection: 'row',
    backgroundColor: '#0A142D',
    borderRadius: 8,
    padding: 8,
  },
  telemetryItem: {
    flex: 1,
    alignItems: 'center',
  },
  telemetryLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    marginBottom: 2,
  },
  telemetryVal: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  /* Contact Details */
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A142D',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  contactAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E356D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  contactPhone: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 1,
  },
  callBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.safetyGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dispatchActionsRow: {
    flexDirection: 'row',
  },
  /* Timestamps & Log */
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#172554',
  },
  detailLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  detailVal: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  /* Bottom Control Bar */
  bottomControlBar: {
    flexDirection: 'row',
    marginVertical: 14,
  },
});
