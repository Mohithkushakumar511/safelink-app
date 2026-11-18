import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Input } from '@/components/Input';
import { SafeLinkMapView } from '@/components/MapView';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/hooks/useAuth';
import { LocationService, LocationData } from '@/services/location';
import { SosDispatchService } from '@/services/sos';
import { DirectSmsService, SmsDispatchResult } from '@/services/sms';
import { MultilingualService } from '@/services/multilingual';
import { offlineQueueService } from '@/services/offlineQueue';
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
  const [escalationSeconds, setEscalationSeconds] = useState<number | null>(null);

  // Feature 1: Secure SOS Cancellation State
  const [isCancelPinModalVisible, setIsCancelPinModalVisible] = useState<boolean>(false);
  const [cancelPinInput, setCancelPinInput] = useState<string>('');
  const [cancelPasswordBypass, setCancelPasswordBypass] = useState<string>('');
  const [usePasswordBypass, setUsePasswordBypass] = useState<boolean>(false);
  const [cancelPinError, setCancelPinError] = useState<string>('');
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  const trackingTimerRef = useRef<any>(null);
  const pollTimerRef = useRef<any>(null);

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
      try {
        if (params.id) {
          targetIncident = await api.sos.getIncident(params.id as string);
        } else {
          targetIncident = await api.sos.getActive();
        }
      } catch (fetchErr) {
        console.warn('[SOS Tracking] Backend fetch note, checking local offline queue:', fetchErr);
        if (params.id) {
          const pending = offlineQueueService.getPendingIncident(params.id as string);
          if (pending) {
            targetIncident = {
              id: pending.id,
              incident_id: pending.syncedIncidentId || pending.id,
              user_id: pending.user_id || 'local_user',
              user_name: pending.user_name || 'SafeLink User',
              user_phone: pending.user_phone,
              status: pending.status === 'CANCELLED' ? 'CANCELLED' : 'ACTIVE',
              status_details: 'Emergency SOS initiated in Offline Mode. Cellular SMS sent. Cloud sync pending.',
              activated_at: pending.activated_at,
              timestamp: pending.activated_at,
              latitude: pending.latitude,
              longitude: pending.longitude,
              accuracy: pending.accuracy,
              address: pending.address || 'Captured GPS Coordinates',
              google_maps_url: LocationService.generateGoogleMapsLink(pending.latitude, pending.longitude),
              emergency_message: 'Emergency SOS activated while offline. Cellular SMS dispatched.',
              created_offline: true,
              connectivity_status: 'OFFLINE_SMS_READY',
              retry_count: pending.attemptCount,
              latest_location: {
                latitude: pending.latitude,
                longitude: pending.longitude,
                accuracy: pending.accuracy,
                address: pending.address,
              },
            };
          }
        }
      }

      if (targetIncident) {
        setIncident(targetIncident);
        if (targetIncident.latest_location && targetIncident.latest_location.latitude) {
          setCurrentLoc({
            latitude: targetIncident.latest_location.latitude,
            longitude: targetIncident.latest_location.longitude,
            accuracy: targetIncident.latest_location.accuracy,
            address: targetIncident.latest_location.address,
            googleMapsUrl: targetIncident.google_maps_url,
          });
        } else if (targetIncident.latitude && targetIncident.longitude) {
          setCurrentLoc({
            latitude: targetIncident.latitude,
            longitude: targetIncident.longitude,
            accuracy: targetIncident.accuracy || 15,
            address: targetIncident.address || 'Captured GPS Coordinates',
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

  // Sync live escalation countdown seconds from incident
  useEffect(() => {
    if (incident?.escalation?.seconds_remaining !== undefined && incident?.escalation?.seconds_remaining !== null) {
      setEscalationSeconds(incident.escalation.seconds_remaining);
    }
  }, [incident?.escalation?.seconds_remaining]);

  // Local 1-second countdown tick for smooth UI updates
  useEffect(() => {
    if (escalationSeconds !== null && escalationSeconds > 0 && incident?.escalation?.status === 'WAITING_ACK') {
      const interval = setInterval(() => {
        setEscalationSeconds((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [escalationSeconds, incident?.escalation?.status]);

  // Periodic telemetry and escalation refresh polling every 4s while active
  useEffect(() => {
    if (incident && incident.status === 'ACTIVE') {
      pollTimerRef.current = setInterval(async () => {
        try {
          const fresh = await api.sos.getIncident(incident.incident_id || incident.id);
          if (fresh) {
            setIncident(fresh);
          }
        } catch {}
      }, 4000);
    } else {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [incident?.status, incident?.incident_id]);

  // Contact Acknowledgement Handler (Supports Live Stage 2 Demonstration)
  const handleSimulateAck = async (responseStatus: 'ACKNOWLEDGED' | 'I_AM_RESPONDING' | 'UNABLE_TO_RESPOND') => {
    if (!incident) return;
    try {
      const res = await api.sos.acknowledge(incident.incident_id || incident.id, {
        contact_name: incident.escalation?.current_contact_name || incident.primary_contact_name || 'Emergency Responder',
        contact_phone: incident.escalation?.current_contact_phone || incident.primary_contact_phone,
        response_status: responseStatus,
        note: responseStatus === 'UNABLE_TO_RESPOND' ? 'Responder unable to attend' : 'Acknowledged via SafeLink verification portal',
      });
      setIncident(res);
      Alert.alert(
        responseStatus === 'UNABLE_TO_RESPOND' ? 'Response: Unable to Attend' : 'Response: Acknowledged',
        responseStatus === 'UNABLE_TO_RESPOND'
          ? 'Contact indicated unable to respond. SafeLink is automatically escalating to the next priority contact.'
          : 'Emergency contact acknowledgement recorded. Automatic escalation stopped.'
      );
    } catch (err: any) {
      Alert.alert('Acknowledgement Failed', formatApiError(err));
    }
  };

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
    const isUnavailable = !currentLoc || currentLoc.isUnavailable || (!currentLoc.latitude && !currentLoc.longitude);
    const lang = await MultilingualService.getSelectedLanguage();
    const msg = MultilingualService.buildMessage(
      {
        name: userName,
        incidentId: incident.incident_id || incident.id,
        activationTime: new Date(incident.activated_at || incident.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        locationUrl: isUnavailable ? undefined : locUrl,
        isUnavailable,
        description: incident.emergency_description || undefined,
      },
      lang
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

      if (smsResult.status === 'FAILED') {
        const cleanP = phone.replace(/[^\d+]/g, '');
        Alert.alert(
          'SMS Dispatch Fallback',
          'Could not open default SMS app on your device. Please call your contact directly.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Call Emergency Contact', onPress: () => Linking.openURL(`tel:${cleanP}`) },
          ]
        );
      } else {
        // Optional follow-up question: ask if they want to send via WhatsApp as well
        setTimeout(() => {
          Alert.alert(
            'Send via WhatsApp as well?',
            `Emergency SMS has been prepared for ${incident.primary_contact_name || 'your emergency contact'}.\n\nWould you also like to send this alert and coordinates via WhatsApp?`,
            [
              { text: 'Skip', style: 'cancel' },
              {
                text: 'Send on WhatsApp',
                onPress: async () => {
                  await SosDispatchService.openWhatsApp(phone, msg);
                },
              },
            ]
          );
        }, 1000);
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
    const isUnavailable = !currentLoc || currentLoc.isUnavailable || (!currentLoc.latitude && !currentLoc.longitude);
    const lang = await MultilingualService.getSelectedLanguage();
    const msg = MultilingualService.buildMessage(
      {
        name: userName,
        incidentId: incident.incident_id || incident.id,
        activationTime: new Date(incident.activated_at || incident.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        locationUrl: isUnavailable ? undefined : locUrl,
        isUnavailable,
        description: incident.emergency_description || undefined,
      },
      lang
    );

    Alert.alert(
      'Dispatch WhatsApp Alert',
      `Send emergency alert and coordinates to ${incident.primary_contact_name || 'your emergency contact'} via WhatsApp?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open WhatsApp',
          onPress: async () => {
            await SosDispatchService.openWhatsApp(phone, msg);
          },
        },
      ]
    );
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

  // Feature 1: Secure SOS Cancellation
  const handleCancelSOS = () => {
    if (!incident) return;
    setCancelPinInput('');
    setCancelPasswordBypass('');
    setUsePasswordBypass(false);
    setCancelPinError('');
    setIsCancelPinModalVisible(true);
  };

  const handleConfirmCancelSOS = async () => {
    if (!incident) return;
    setCancelPinError('');

    if (user?.cancellation_pin_set && !usePasswordBypass) {
      if (!cancelPinInput.trim() || cancelPinInput.length < 4 || cancelPinInput.length > 6 || !/^\d+$/.test(cancelPinInput)) {
        setCancelPinError('Please enter your 4 to 6-digit cancellation PIN.');
        return;
      }
    } else if (usePasswordBypass) {
      if (!cancelPasswordBypass.trim()) {
        setCancelPinError('Please enter your account password.');
        return;
      }
    }

    setIsCancelling(true);
    try {
      const reason = 'Cancelled by user (Accidental activation / False alarm)';
      const pin = usePasswordBypass ? undefined : cancelPinInput.trim() || undefined;
      const pwdBypass = usePasswordBypass ? cancelPasswordBypass.trim() : undefined;

      const res = await api.sos.cancel(
        incident.incident_id || incident.id,
        reason,
        pin,
        pwdBypass
      );

      setIncident(res);
      setIsCancelPinModalVisible(false);
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
      const errMsg = formatApiError(err);
      if (errMsg.toLowerCase().includes('pin') || errMsg.toLowerCase().includes('password') || errMsg.toLowerCase().includes('incorrect')) {
        setCancelPinError(errMsg);
      } else {
        console.warn('[SOS Tracking] Backend cancel error, recording offline cancellation:', err?.message);
        await offlineQueueService.cancelOfflineIncident(
          incident.incident_id || incident.id,
          'Cancelled by user (Offline cancellation)'
        );
        setIncident({
          ...incident,
          status: 'CANCELLED',
          status_details: 'Incident cancelled locally while offline.',
          cancelled_at: new Date().toISOString(),
        });
        if (trackingTimerRef.current) clearInterval(trackingTimerRef.current);
        setIsCancelPinModalVisible(false);
        Alert.alert('SOS Cancelled Locally', 'Emergency alert marked cancelled. Telemetry stopped and status saved.');
      }
    } finally {
      setIsCancelling(false);
    }
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
              console.warn('[SOS Tracking] Backend cancel failed, recording offline cancellation:', err?.message);
              await offlineQueueService.cancelOfflineIncident(
                incident.incident_id || incident.id,
                'Cancelled by user (Offline cancellation)'
              );
              setIncident({
                ...incident,
                status: 'CANCELLED',
                status_details: 'Incident cancelled locally while offline.',
                cancelled_at: new Date().toISOString(),
              });
              if (trackingTimerRef.current) clearInterval(trackingTimerRef.current);
              Alert.alert('SOS Cancelled Locally', 'Emergency alert marked cancelled. Telemetry stopped and status saved.');
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
      {/* Incident Status Banner */}
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

      {/* Interactive Map View */}
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

      {/* Location & Telemetry Details */}
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

      {/* Emergency Contact Dispatched */}
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

      {/* Automatic Emergency Escalation Ladder */}
      <Card style={styles.escalationCard}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="git-network-outline" size={18} color={Colors.emergencyRedBright} />
            <Text style={styles.cardTitle}>Emergency Escalation Ladder</Text>
          </View>
          <Badge
            label={
              incident.escalation?.status === 'ACKNOWLEDGED'
                ? 'ACKNOWLEDGED'
                : incident.escalation?.status === 'EXHAUSTED'
                ? 'ALL CONTACTS ALERTED'
                : isActive
                ? `LEVEL ${incident.escalation?.level || 1} ACTIVE`
                : 'CONCLUDED'
            }
            variant={
              incident.escalation?.status === 'ACKNOWLEDGED'
                ? 'success'
                : incident.escalation?.status === 'EXHAUSTED'
                ? 'warning'
                : isActive
                ? 'danger'
                : 'neutral'
            }
          />
        </View>

        {/* Visual Level Progression Ladder */}
        <View style={styles.escalationLadderProgression}>
          {[1, 2, 3].map((lvl) => {
            const currentLvl = incident.escalation?.level || 1;
            const isCurrent = currentLvl === lvl && isActive && incident.escalation?.status === 'WAITING_ACK';
            const isPassed = currentLvl > lvl || incident.escalation?.status === 'ACKNOWLEDGED';

            return (
              <React.Fragment key={lvl}>
                <View style={[styles.ladderNode, isCurrent && styles.ladderNodeCurrent, isPassed && styles.ladderNodePassed]}>
                  <Text style={[styles.ladderNodeNum, (isCurrent || isPassed) && styles.ladderNodeNumActive]}>
                    L{lvl}
                  </Text>
                  <Text style={styles.ladderNodeLabel}>
                    {lvl === 1 ? 'Primary' : lvl === 2 ? 'Secondary' : 'Tertiary'}
                  </Text>
                </View>
                {lvl < 3 && (
                  <View style={[styles.ladderConnector, isPassed && styles.ladderConnectorPassed]} />
                )}
              </React.Fragment>
            );
          })}
        </View>

        {/* Active Contact State */}
        <View style={styles.escalationDetailsBox}>
          <View style={styles.escalationDetailRow}>
            <Text style={styles.escalationLabel}>Target Contact:</Text>
            <Text style={styles.escalationValue}>
              {incident.escalation?.current_contact_name || incident.primary_contact_name || 'Emergency Responder'}
            </Text>
          </View>
          <View style={styles.escalationDetailRow}>
            <Text style={styles.escalationLabel}>Target Phone:</Text>
            <Text style={styles.escalationValue}>
              {incident.escalation?.current_contact_phone || incident.primary_contact_phone || 'N/A'}
            </Text>
          </View>
          <View style={styles.escalationDetailRow}>
            <Text style={styles.escalationLabel}>Attempts Dispatched:</Text>
            <Text style={styles.escalationValue}>
              {incident.escalation?.attempts || 1} notification attempt(s)
            </Text>
          </View>

          {/* Time Remaining Before Next Escalation */}
          {isActive && incident.escalation?.status === 'WAITING_ACK' && (
            <View style={styles.countdownRow}>
              <Ionicons name="timer-outline" size={16} color={Colors.warningAmber} />
              <Text style={styles.countdownText}>
                Next Escalation in:{' '}
                <Text style={{ fontWeight: '800', color: Colors.warningAmber }}>
                  {escalationSeconds !== null ? `${escalationSeconds}s` : `${incident.escalation?.timeout_seconds || 120}s`}
                </Text>
              </Text>
            </View>
          )}

          {/* Acknowledgement Status Callout */}
          {incident.escalation?.status === 'ACKNOWLEDGED' && (
            <View style={styles.ackBannerSuccess}>
              <Ionicons name="shield-checkmark" size={18} color={Colors.safetyGreen} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.ackBannerTitle}>Contact Acknowledged!</Text>
                <Text style={styles.ackBannerSub}>
                  {incident.escalation?.acknowledged_by?.contact_name || 'Responder'} confirmed:{' '}
                  "{incident.escalation?.acknowledged_by?.response_status || 'I Am Responding'}". Automatic escalation halted.
                </Text>
              </View>
            </View>
          )}

          {incident.escalation?.status === 'EXHAUSTED' && (
            <View style={styles.ackBannerWarning}>
              <Ionicons name="alert-circle" size={18} color={Colors.warningAmber} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.ackBannerTitle}>Ladder Fully Escalated</Text>
                <Text style={styles.ackBannerSub}>
                  All configured priority contacts have been alerted. Emergency broadcast remains active.
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Responder Simulation Action Bar (Stage 2 Hackathon Demonstration) */}
        {isActive && incident.escalation?.status === 'WAITING_ACK' && (
          <View style={styles.ackSimulationBox}>
            <Text style={styles.ackSimulationHeader}>Simulate Responder Response (Evaluation Demo):</Text>
            <View style={styles.ackSimulationButtonsRow}>
              <TouchableOpacity
                style={[styles.simAckBtn, { backgroundColor: 'rgba(16, 185, 129, 0.2)', borderColor: Colors.safetyGreen }]}
                onPress={() => handleSimulateAck('ACKNOWLEDGED')}
                activeOpacity={0.7}
              >
                <Ionicons name="checkmark-done" size={14} color={Colors.safetyGreen} />
                <Text style={[styles.simAckBtnText, { color: Colors.safetyGreen }]}>I Acknowledge</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.simAckBtn, { backgroundColor: 'rgba(59, 130, 246, 0.2)', borderColor: Colors.infoBlue }]}
                onPress={() => handleSimulateAck('I_AM_RESPONDING')}
                activeOpacity={0.7}
              >
                <Ionicons name="navigate" size={14} color={Colors.infoBlue} />
                <Text style={[styles.simAckBtnText, { color: Colors.infoBlue }]}>Responding</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.simAckBtn, { backgroundColor: 'rgba(239, 68, 68, 0.2)', borderColor: Colors.emergencyRedBright }]}
                onPress={() => handleSimulateAck('UNABLE_TO_RESPOND')}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={14} color={Colors.emergencyRedBright} />
                <Text style={[styles.simAckBtnText, { color: Colors.emergencyRedBright }]}>Unable</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Card>

      {/* Emergency Event Timeline */}
      <Card style={styles.timelineCard}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="time" size={18} color={Colors.infoBlue} />
            <Text style={styles.cardTitle}>Emergency Event Timeline</Text>
          </View>
          <Badge label={`${incident.timeline?.length || 0} EVENTS`} variant="info" />
        </View>

        <Text style={styles.timelineSubtitle}>
          Real-time chronological audit trail of all safety events, dispatches, and acknowledgements.
        </Text>

        <View style={styles.timelineList}>
          {(incident.timeline || []).map((evt: any, idx: number) => {
            const isLast = idx === (incident.timeline?.length || 1) - 1;
            const evtStatus = evt.status || 'Pending';
            const badgeVariant =
              evtStatus === 'Acknowledged' || evtStatus === 'Resolved'
                ? 'success'
                : evtStatus === 'Escalated'
                ? 'warning'
                : evtStatus === 'Failed'
                ? 'danger'
                : evtStatus === 'Sent'
                ? 'info'
                : 'neutral';

            return (
              <View key={evt.id || idx} style={styles.timelineItem}>
                <View style={styles.timelineIconCol}>
                  <View style={[styles.timelineDot, evtStatus === 'Acknowledged' && styles.timelineDotSuccess, evtStatus === 'Escalated' && styles.timelineDotWarning]}>
                    <Ionicons
                      name={(evt.icon as any) || 'radio-button-on'}
                      size={12}
                      color="#FFFFFF"
                    />
                  </View>
                  {!isLast && <View style={styles.timelineLine} />}
                </View>

                <View style={styles.timelineContent}>
                  <View style={styles.timelineHeaderRow}>
                    <Text style={styles.timelineItemTitle}>{evt.title}</Text>
                    <Badge label={evtStatus} variant={badgeVariant as any} />
                  </View>

                  <Text style={styles.timelineItemTime}>
                    {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </Text>

                  <Text style={styles.timelineItemDesc}>{evt.description}</Text>

                  {/* Coordinates Badge */}
                  {evt.latitude !== undefined && evt.latitude !== null && (
                    <View style={styles.timelineCoordsChip}>
                      <Ionicons name="location" size={11} color={Colors.infoBlue} />
                      <Text style={styles.timelineCoordsText}>
                        {evt.latitude.toFixed(5)}, {evt.longitude.toFixed(5)} (±{Math.round(evt.accuracy || 10)}m)
                      </Text>
                    </View>
                  )}

                  {/* Contact Badge */}
                  {evt.contact_name && (
                    <View style={styles.timelineContactChip}>
                      <Ionicons name="person" size={11} color={Colors.textSecondary} />
                      <Text style={styles.timelineContactText}>
                        Responder: {evt.contact_name} {evt.contact_phone ? `(${evt.contact_phone})` : ''}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </Card>

      {/* Timestamps & Incident Log Details */}
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

      {/* Bottom Actions: Resolve or Cancel */}
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

      {/* Secure SOS Cancellation PIN Modal */}
      <Modal visible={isCancelPinModalVisible} transparent animationType="fade">
        <View style={styles.cancelModalBackdrop}>
          <Card style={styles.cancelModalCard}>
            <View style={styles.cancelModalIconCircle}>
              <Ionicons name="shield-half" size={32} color={Colors.emergencyRedBright} />
            </View>

            <Text style={styles.cancelModalTitle}>CONFIRM EMERGENCY CANCELLATION</Text>
            <Text style={styles.cancelModalSub}>
              Cancelling will immediately stop real-time GPS telemetry, halt all pending emergency contact escalation levels, and record this incident as CANCELLED.
            </Text>

            {cancelPinError ? (
              <View style={styles.cancelErrorBanner}>
                <Ionicons name="alert-circle" size={16} color={Colors.emergencyRedBright} />
                <Text style={styles.cancelErrorBannerText}>{cancelPinError}</Text>
              </View>
            ) : null}

            {user?.cancellation_pin_set && !usePasswordBypass ? (
              <View style={{ width: '100%', marginBottom: 12 }}>
                <Input
                  label="Enter 4-6 Digit Cancellation PIN"
                  placeholder="e.g. 1234"
                  keyboardType="number-pad"
                  maxLength={6}
                  secureTextEntry
                  value={cancelPinInput}
                  onChangeText={setCancelPinInput}
                  leftIcon={<Ionicons name="key-outline" size={18} color={Colors.textMuted} />}
                />
                <TouchableOpacity
                  onPress={() => {
                    setUsePasswordBypass(true);
                    setCancelPinError('');
                  }}
                  style={{ alignSelf: 'flex-end', marginTop: 4 }}
                >
                  <Text style={{ fontSize: 12, color: Colors.infoBlue, fontWeight: '600' }}>
                    Forgot PIN? Use Account Password
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ width: '100%', marginBottom: 12 }}>
                <Input
                  label="Account Password"
                  placeholder="Enter your account password"
                  secureTextEntry
                  value={cancelPasswordBypass}
                  onChangeText={setCancelPasswordBypass}
                  leftIcon={<Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} />}
                />
                {user?.cancellation_pin_set && (
                  <TouchableOpacity
                    onPress={() => {
                      setUsePasswordBypass(false);
                      setCancelPinError('');
                    }}
                    style={{ alignSelf: 'flex-end', marginTop: 4 }}
                  >
                    <Text style={{ fontSize: 12, color: Colors.infoBlue, fontWeight: '600' }}>
                      Back to PIN verification
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={{ width: '100%', marginTop: 8 }}>
              <Button
                title="CONFIRM CANCELLATION"
                onPress={handleConfirmCancelSOS}
                variant="danger"
                size="lg"
                loading={isCancelling}
                style={{ marginBottom: 10 }}
                leftIcon={<Ionicons name="close-circle" size={18} color="#FFFFFF" />}
              />
              <Button
                title="KEEP ACTIVE (Accidental Tap)"
                onPress={() => {
                  setIsCancelPinModalVisible(false);
                  setCancelPinError('');
                }}
                variant="secondary"
                size="md"
                leftIcon={<Ionicons name="shield-outline" size={18} color={Colors.textSecondary} />}
              />
            </View>
          </Card>
        </View>
      </Modal>
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
  /* Escalation Ladder Card */
  escalationCard: {
    marginBottom: 12,
    backgroundColor: '#0F1E3D',
    borderColor: '#1E3A8A',
    borderWidth: 1.5,
  },
  escalationLadderProgression: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
    paddingHorizontal: 10,
  },
  ladderNode: {
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#0A1329',
    borderWidth: 1.5,
    borderColor: '#1E293B',
    minWidth: 64,
  },
  ladderNodeCurrent: {
    borderColor: Colors.emergencyRedBright,
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
  },
  ladderNodePassed: {
    borderColor: Colors.safetyGreen,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  ladderNodeNum: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.textMuted,
  },
  ladderNodeNumActive: {
    color: '#FFFFFF',
  },
  ladderNodeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  ladderConnector: {
    flex: 1,
    height: 2,
    backgroundColor: '#1E293B',
    marginHorizontal: 4,
  },
  ladderConnectorPassed: {
    backgroundColor: Colors.safetyGreen,
  },
  escalationDetailsBox: {
    backgroundColor: '#0A142D',
    borderRadius: 8,
    padding: 10,
  },
  escalationDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  escalationLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  escalationValue: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#172554',
  },
  countdownText: {
    color: Colors.textPrimary,
    fontSize: 12,
    marginLeft: 6,
  },
  ackBannerSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: Colors.safetyGreen,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  ackBannerWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: Colors.warningAmber,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  ackBannerTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  ackBannerSub: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  ackSimulationBox: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  ackSimulationHeader: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ackSimulationButtonsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  simAckBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  simAckBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
  /* Emergency Event Timeline */
  timelineCard: {
    marginBottom: 12,
    backgroundColor: '#101F42',
    borderColor: '#1E356D',
  },
  timelineSubtitle: {
    color: Colors.textMuted,
    fontSize: 11,
    marginBottom: 14,
    lineHeight: 16,
  },
  timelineList: {
    paddingLeft: 4,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  timelineIconCol: {
    alignItems: 'center',
    width: 28,
  },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1E3A8A',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotSuccess: {
    backgroundColor: '#065F46',
    borderColor: Colors.safetyGreen,
  },
  timelineDotWarning: {
    backgroundColor: '#92400E',
    borderColor: Colors.warningAmber,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#1E356D',
    marginVertical: 4,
  },
  timelineContent: {
    flex: 1,
    marginLeft: 10,
    paddingBottom: 4,
  },
  timelineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  timelineItemTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
    marginRight: 6,
  },
  timelineItemTime: {
    color: Colors.textMuted,
    fontSize: 11,
    marginBottom: 3,
  },
  timelineItemDesc: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  timelineCoordsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    marginTop: 4,
  },
  timelineCoordsText: {
    color: '#93C5FD',
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 4,
  },
  timelineContactChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A142D',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    marginTop: 4,
  },
  timelineContactText: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
  },
  cancelModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  cancelModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#0F1D3D',
    borderColor: '#DC2626',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  cancelModalIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  cancelModalTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  cancelModalSub: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 14,
  },
  cancelErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: Colors.emergencyRedBright,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    width: '100%',
  },
  cancelErrorBannerText: {
    color: Colors.emergencyRedBright,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },
});
