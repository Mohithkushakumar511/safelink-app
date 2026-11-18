import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer, AudioPlayer } from 'expo-audio';
import * as Linking from 'expo-linking';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Colors } from '@/constants/colors';
import { api, formatApiError } from '@/services/api';
import { SosDispatchService } from '@/services/sos';
import { SafeLinkMapView } from '@/components/MapView';
import { AudioService } from '@/services/audio';
import { useAuth } from '@/hooks/useAuth';

export default function IncidentDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [incident, setIncident] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Audio Playback State
  const [sound, setSound] = useState<AudioPlayer | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioPlaybackPosition, setAudioPlaybackPosition] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  const fetchIncidentDetails = async () => {
    if (!id || !isAuthenticated || authLoading) return;
    setIsLoading(true);
    try {
      const data = await api.sos.getIncident(id);
      setIncident(data);
    } catch (err: any) {
      Alert.alert('Incident Notice', formatApiError(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated) {
        router.replace('/login');
      } else {
        fetchIncidentDetails();
      }
    }
    return () => {
      if (sound) {
        try {
          sound.pause();
          sound.remove();
        } catch {}
      }
    };
  }, [id, authLoading, isAuthenticated]);

  // Handle Voice Note Playback
  const handleToggleAudioPlayback = async () => {
    if (!incident) return;

    if (sound) {
      if (isPlayingAudio) {
        sound.pause();
        setIsPlayingAudio(false);
      } else {
        sound.play();
        setIsPlayingAudio(true);
      }
      return;
    }

    // Load sound from backend stream URL
    const streamUrl = api.sos.getVoiceStreamUrl(incident.incident_id || incident.id);
    try {
      const newPlayer = createAudioPlayer(streamUrl);
      newPlayer.addListener('playbackStatusUpdate', (playbackStatus) => {
        setAudioPlaybackPosition(Math.floor(playbackStatus.currentTime || 0));
        setAudioDuration(Math.floor(playbackStatus.duration || 0));
        setIsPlayingAudio(playbackStatus.playing);
        if (playbackStatus.playbackState === 'ended' || (playbackStatus.duration > 0 && playbackStatus.currentTime >= playbackStatus.duration)) {
          setIsPlayingAudio(false);
          setAudioPlaybackPosition(0);
        }
      });
      newPlayer.play();
      setSound(newPlayer);
      setIsPlayingAudio(true);
    } catch (err) {
      console.warn('[Incident Details] Audio load error:', err);
      Alert.alert('Audio Playback', 'Unable to stream voice note. Please verify connection.');
    }
  };

  const handleOpenExternalMap = () => {
    if (!incident) return;
    const lat = incident.latest_location?.latitude || incident.latitude;
    const lng = incident.latest_location?.longitude || incident.longitude;
    const url = `https://maps.google.com/?q=${lat},${lng}`;
    Linking.openURL(url).catch(() => {});
  };

  const handleCopyMessage = () => {
    if (!incident) return;
    const msg =
      incident.recipient_info?.message_content ||
      incident.emergency_message ||
      'No emergency message recorded';
    Share.share({ message: msg });
  };

  const handleCallRecipient = () => {
    const phone =
      incident?.recipient_info?.recipient_phone ||
      incident?.primary_contact_phone;
    if (phone) {
      Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`).catch(() => {});
    }
  };

  const handleSmsRecipient = async () => {
    const phone =
      incident?.recipient_info?.recipient_phone ||
      incident?.primary_contact_phone;
    const msg =
      incident?.recipient_info?.message_content ||
      incident?.emergency_message ||
      'Emergency update regarding Incident #' + (incident?.incident_id || id);
    if (phone) {
      await SosDispatchService.openNativeSMS(phone, msg);
    }
  };

  const handleWhatsAppRecipient = async () => {
    const phone =
      incident?.recipient_info?.recipient_phone ||
      incident?.primary_contact_phone;
    const msg =
      incident?.recipient_info?.message_content ||
      incident?.emergency_message ||
      'Emergency update regarding Incident #' + (incident?.incident_id || id);
    if (phone) {
      await SosDispatchService.openWhatsApp(phone, msg);
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '--';
    try {
      const d = new Date(isoString);
      return d.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const formatDuration = (seconds?: number) => {
    if (seconds === undefined || seconds === null) return '--';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const remainingSecs = seconds % 60;
    if (mins < 60) return `${mins}m ${remainingSecs}s`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  };

  if (isLoading) {
    return (
      <ScreenWrapper style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.emergencyRedBright} />
        <Text style={styles.loadingText}>Retrieving Incident Audit Dossier...</Text>
      </ScreenWrapper>
    );
  }

  if (!incident) {
    return (
      <ScreenWrapper style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={56} color={Colors.textMuted} />
        <Text style={styles.errorTitle}>Incident Not Found</Text>
        <Text style={styles.errorSub}>The requested emergency incident record could not be loaded.</Text>
        <Button
          title="Return to Incident Log"
          onPress={() => router.replace('/history')}
          variant="secondary"
          size="md"
          style={{ marginTop: 16 }}
        />
      </ScreenWrapper>
    );
  }

  const isAct = incident.status === 'ACTIVE';
  const isRes = incident.status === 'RESOLVED';
  const isCan = incident.status === 'CANCELLED';
  const badgeVariant = isAct ? 'danger' : isRes ? 'success' : 'warning';

  const initLat = incident.initial_location?.latitude || incident.latitude || 0;
  const initLng = incident.initial_location?.longitude || incident.longitude || 0;
  const initAddr = incident.initial_location?.address || incident.address || 'GPS Coordinates Recorded';

  const latLat = incident.latest_location?.latitude || incident.latitude || initLat;
  const latLng = incident.latest_location?.longitude || incident.longitude || initLng;
  const latAddr = incident.latest_location?.address || incident.address || initAddr;

  const recipient = incident.recipient_info || {
    recipient_name: incident.primary_contact_name || 'Emergency Responder',
    recipient_phone: incident.primary_contact_phone || '911',
    sending_method: 'SMS',
    sending_status: 'SUBMITTED',
    delivery_confirmation: 'UNCONFIRMED_CLIENT_SMS (Native SMS Composer Invoked)',
    submitted_at: incident.activated_at,
    message_content: incident.emergency_message,
  };

  return (
    <ScreenWrapper scrollable contentContainerStyle={styles.container}>
      {/* Top Header Bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Incident Dossier</Text>
          <Text style={styles.headerSubtitle}>#{incident.incident_id || incident.id}</Text>
        </View>
        <Badge label={incident.status} variant={badgeVariant} />
      </View>

      {/* Map Card */}
      <Card style={styles.mapCard}>
        <View style={styles.mapHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons
              name={isAct ? 'radio' : 'pin'}
              size={18}
              color={isAct ? Colors.emergencyRedBright : Colors.safetyGreen}
            />
            <Text style={styles.mapCardTitle}>
              {isAct ? 'Live GPS Incident Location' : 'Final Recorded GPS Fix'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleOpenExternalMap}
            style={styles.extMapButton}
            activeOpacity={0.7}
          >
            <Ionicons name="open-outline" size={15} color={Colors.infoBlue} />
            <Text style={styles.extMapText}>Open Maps</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.mapWrapper}>
          <SafeLinkMapView
            latitude={latLat}
            longitude={latLng}
            accuracy={incident.latest_location?.accuracy || incident.accuracy}
            markerTitle={isAct ? 'Live Incident Fix' : 'Final Recorded Position'}
            isEmergency={isAct}
          />
        </View>

        <View style={styles.mapFooterRow}>
          <Ionicons name="navigate-circle-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.mapFooterText} numberOfLines={2}>
            {latAddr}
          </Text>
        </View>
      </Card>

      {/* Incident Status & Time Metrics */}
      <Card style={styles.metricsCard}>
        <View style={styles.metricGrid}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>ACTIVATED</Text>
            <Text style={styles.metricValue}>{formatDate(incident.activated_at || incident.timestamp)}</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>
              {isRes ? 'RESOLVED' : isCan ? 'CANCELLED' : 'TRACKING DURATION'}
            </Text>
            <Text style={styles.metricValue}>
              {isRes && incident.resolved_at
                ? formatDate(incident.resolved_at)
                : isCan && incident.cancelled_at
                ? formatDate(incident.cancelled_at)
                : formatDuration(incident.duration_seconds)}
            </Text>
          </View>
        </View>

        <View style={styles.statusDivider} />

        <View style={styles.trackingStatusRow}>
          <Ionicons
            name={isAct ? 'pulse' : 'shield-checkmark-outline'}
            size={18}
            color={isAct ? Colors.emergencyRedBright : Colors.safetyGreen}
          />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.trackingStatusTitle}>
              {isAct ? 'Location Tracking Status: ACTIVE' : 'Location Tracking Status: ENDED'}
            </Text>
            <Text style={styles.trackingStatusSub}>
              {isAct
                ? 'High-precision telemetry updates every 10 seconds to SafeLink cloud.'
                : 'Incident completed. Final position preserved in tamper-proof audit trail.'}
            </Text>
          </View>
        </View>

        {/* Device Battery Level (Feature 5) */}
        {incident.battery_level !== undefined && incident.battery_level !== null && (
          <>
            <View style={styles.statusDivider} />
            <View style={styles.trackingStatusRow}>
              <Ionicons
                name={
                  incident.battery_status === 'CHARGING'
                    ? 'battery-charging'
                    : incident.battery_level <= 20
                    ? 'battery-dead'
                    : 'battery-full'
                }
                size={18}
                color={
                  incident.battery_level <= 20
                    ? Colors.emergencyRedBright
                    : incident.battery_status === 'CHARGING'
                    ? Colors.infoBlue
                    : Colors.safetyGreen
                }
              />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.trackingStatusTitle}>
                  Device Battery Level: {Math.round(incident.battery_level)}%
                </Text>
                <Text style={styles.trackingStatusSub}>
                  Status: {incident.battery_status || 'Unplugged'} • Recorded during emergency telemetry
                </Text>
              </View>
            </View>
          </>
        )}
      </Card>

      {/* Emergency Contact & Dispatch Verification (Section C) */}
      <Card style={styles.recipientCard}>
        <View style={styles.sectionHeaderRow}>
          <Ionicons name="paper-plane" size={18} color={Colors.emergencyRedBright} />
          <Text style={styles.sectionTitle}>Emergency Contact Dispatched</Text>
        </View>

        <View style={styles.recipientBox}>
          <View style={{ flex: 1 }}>
            <Text style={styles.recipientName}>{recipient.recipient_name || 'Emergency Responder'}</Text>
            <Text style={styles.recipientPhone}>{recipient.recipient_phone || '911'}</Text>
          </View>
          <View style={styles.commActions}>
            <TouchableOpacity onPress={handleCallRecipient} style={styles.commIconBtn}>
              <Ionicons name="call" size={18} color={Colors.safetyGreen} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSmsRecipient} style={styles.commIconBtn}>
              <Ionicons name="chatbubble" size={18} color={Colors.infoBlue} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleWhatsAppRecipient} style={styles.commIconBtn}>
              <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Dispatch Telemetry */}
        <View style={styles.dispatchMetaBox}>
          <View style={styles.dispatchMetaRow}>
            <Text style={styles.metaFieldLabel}>Sending Method:</Text>
            <Text style={styles.metaFieldValue}>{recipient.sending_method || 'Cellular SMS'}</Text>
          </View>

          <View style={styles.dispatchMetaRow}>
            <Text style={styles.metaFieldLabel}>Dispatch Status:</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={[
                  styles.statusDotSmall,
                  {
                    backgroundColor:
                      recipient.sending_status === 'SENT'
                        ? Colors.safetyGreen
                        : Colors.warningAmber,
                  },
                ]}
              />
              <Text style={styles.metaFieldValue}>{recipient.sending_status || 'SUBMITTED'}</Text>
            </View>
          </View>

          <View style={styles.dispatchMetaRow}>
            <Text style={styles.metaFieldLabel}>Carrier Confirmation:</Text>
            <Text style={styles.metaFieldValueWarning} numberOfLines={2}>
              {recipient.delivery_confirmation || 'Carrier Dependent / Client Submitted'}
            </Text>
          </View>

          <View style={styles.dispatchMetaRow}>
            <Text style={styles.metaFieldLabel}>Submitted At:</Text>
            <Text style={styles.metaFieldValue}>{formatDate(recipient.submitted_at)}</Text>
          </View>
        </View>

        {/* Actual Message Body */}
        <Text style={styles.messageContentLabel}>Actual Emergency Message Sent:</Text>
        <View style={styles.messageContentBox}>
          <Text style={styles.messageContentText}>
            {recipient.message_content || incident.emergency_message || 'Emergency SOS Alert'}
          </Text>
          <TouchableOpacity
            onPress={handleCopyMessage}
            style={styles.copyButton}
            activeOpacity={0.7}
          >
            <Ionicons name="copy-outline" size={14} color={Colors.infoBlue} />
            <Text style={styles.copyText}>Share / Copy</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* Emergency Medical Profile (Feature 9) */}
      {incident.medical_info && (
        <Card style={styles.descriptionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="medkit" size={18} color={Colors.safetyGreen} />
            <Text style={styles.sectionTitle}>Emergency Medical Profile</Text>
            <Badge label="RESPONDER ACCESS" variant="success" style={{ marginLeft: 'auto' }} />
          </View>
          <View style={{ gap: 8, marginTop: 4 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={[styles.descBox, { flex: 1 }]}>
                <Text style={{ fontSize: 10, color: Colors.textMuted, fontWeight: '700' }}>BLOOD GROUP</Text>
                <Text style={{ fontSize: 14, color: '#FFFFFF', fontWeight: '800', marginTop: 2 }}>
                  {incident.medical_info.blood_type || 'N/A'}
                </Text>
              </View>
              <View style={[styles.descBox, { flex: 2 }]}>
                <Text style={{ fontSize: 10, color: Colors.textMuted, fontWeight: '700' }}>ALLERGIES</Text>
                <Text style={{ fontSize: 13, color: '#FFFFFF', fontWeight: '600', marginTop: 2 }}>
                  {incident.medical_info.allergies || 'None reported'}
                </Text>
              </View>
            </View>

            {(incident.medical_info.existing_conditions || incident.medical_info.medications) && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {incident.medical_info.existing_conditions && (
                  <View style={[styles.descBox, { flex: 1 }]}>
                    <Text style={{ fontSize: 10, color: Colors.textMuted, fontWeight: '700' }}>CONDITIONS</Text>
                    <Text style={{ fontSize: 12, color: '#FFFFFF', fontWeight: '600', marginTop: 2 }}>
                      {incident.medical_info.existing_conditions}
                    </Text>
                  </View>
                )}
                {incident.medical_info.medications && (
                  <View style={[styles.descBox, { flex: 1 }]}>
                    <Text style={{ fontSize: 10, color: Colors.textMuted, fontWeight: '700' }}>MEDICATIONS</Text>
                    <Text style={{ fontSize: 12, color: '#FFFFFF', fontWeight: '600', marginTop: 2 }}>
                      {incident.medical_info.medications}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {incident.medical_info.medical_notes && (
              <View style={styles.descBox}>
                <Text style={{ fontSize: 10, color: Colors.textMuted, fontWeight: '700' }}>CRITICAL NOTES</Text>
                <Text style={{ fontSize: 12, color: '#FFFFFF', marginTop: 2 }}>
                  {incident.medical_info.medical_notes}
                </Text>
              </View>
            )}
          </View>
        </Card>
      )}

      {/* Emergency Description (Section D) */}
      <Card style={styles.descriptionCard}>
        <View style={styles.sectionHeaderRow}>
          <Ionicons name="document-text" size={18} color={Colors.warningAmber} />
          <Text style={styles.sectionTitle}>Emergency Description</Text>
        </View>
        <View style={styles.descBox}>
          {incident.emergency_description ? (
            <Text style={styles.descText}>"{incident.emergency_description}"</Text>
          ) : (
            <Text style={styles.descTextEmpty}>
              No emergency description was entered by the user prior to dispatch.
            </Text>
          )}
        </View>
      </Card>

      {/* Voice Emergency Recording (Section E) */}
      <Card style={styles.voiceCard}>
        <View style={styles.sectionHeaderRow}>
          <Ionicons name="mic" size={18} color={Colors.emergencyRedBright} />
          <Text style={styles.sectionTitle}>Emergency Voice Note</Text>
        </View>

        {incident.has_voice_recording || incident.voice_recording_url ? (
          <View style={styles.voicePlayerBox}>
            <TouchableOpacity
              onPress={handleToggleAudioPlayback}
              style={styles.audioPlayButton}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isPlayingAudio ? 'pause' : 'play'}
                size={24}
                color="#FFFFFF"
              />
            </TouchableOpacity>

            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.voicePlayTitle}>
                {isPlayingAudio ? 'Playing Voice Recording...' : 'Listen to Emergency Voice Note'}
              </Text>
              <Text style={styles.voiceDuration}>
                {AudioService.formatDuration(audioPlaybackPosition)} /{' '}
                {AudioService.formatDuration(
                  incident.voice_recording_duration_seconds || audioDuration || 5
                )}
              </Text>
            </View>

            <View style={styles.encryptedBadge}>
              <Ionicons name="lock-closed" size={13} color={Colors.safetyGreen} />
              <Text style={styles.encryptedText}>Secured</Text>
            </View>
          </View>
        ) : (
          <View style={styles.noVoiceBox}>
            <Ionicons name="mic-off-outline" size={24} color={Colors.textMuted} />
            <Text style={styles.noVoiceText}>No audio note was attached to this SOS alert.</Text>
          </View>
        )}
      </Card>

      {/* Escalation Telemetry Summary Card */}
      {incident.escalation && (
        <Card style={styles.metricsCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="git-network-outline" size={18} color={Colors.emergencyRedBright} />
            <Text style={styles.sectionTitle}>Emergency Escalation Ladder</Text>
          </View>
          <View style={styles.metricGrid}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>ESCALATION LEVEL</Text>
              <Text style={styles.metricValue}>Level {incident.escalation.level || 1}</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>STATUS</Text>
              <Text style={[styles.metricValue, { color: incident.escalation.status === 'ACKNOWLEDGED' ? Colors.safetyGreen : Colors.warningAmber }]}>
                {incident.escalation.status}
              </Text>
            </View>
          </View>
          <View style={[styles.metricGrid, { marginTop: 10 }]}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>NOTIFICATION ATTEMPTS</Text>
              <Text style={styles.metricValue}>{incident.escalation.attempts || 1}</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>RESPONDER</Text>
              <Text style={styles.metricValue} numberOfLines={1}>
                {incident.escalation.acknowledged_by?.contact_name || incident.escalation.current_contact_name || 'Emergency Responder'}
              </Text>
            </View>
          </View>
        </Card>
      )}

      {/* Chronological Incident Timeline */}
      <Card style={styles.timelineCard}>
        <View style={styles.sectionHeaderRow}>
          <Ionicons name="time" size={18} color={Colors.infoBlue} />
          <Text style={styles.sectionTitle}>Chronological Incident Timeline</Text>
          <Badge label={`${incident.timeline?.length || 0} EVENTS`} variant="info" style={{ marginLeft: 'auto' }} />
        </View>

        <View style={styles.timelineList}>
          {(incident.timeline || [
            {
              event: 'SOS_ACTIVATED',
              title: 'Emergency SOS Activated',
              description: `Initiated by ${incident.user_name || 'User'}`,
              timestamp: incident.activated_at,
              status: 'Sent',
              icon: 'alert-circle',
            },
            {
              event: 'LOCATION_CAPTURED',
              title: 'Initial Location Captured',
              description: `Lat: ${initLat.toFixed(5)}, Lng: ${initLng.toFixed(5)}`,
              timestamp: incident.activated_at,
              status: 'Sent',
              icon: 'pin',
            },
            {
              event: 'RECIPIENT_DISPATCHED',
              title: `Dispatched to ${recipient.recipient_name}`,
              description: `Via ${recipient.sending_method}`,
              timestamp: recipient.submitted_at || incident.activated_at,
              status: 'Attempted',
              icon: 'paper-plane',
            },
          ]).map((item: any, idx: number) => {
            const isLast = idx === (incident.timeline?.length || 3) - 1;
            const evtStatus = item.status || 'Sent';
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
              <View key={item.id || idx} style={styles.timelineItem}>
                <View style={styles.timelineIconCol}>
                  <View style={styles.timelineDot}>
                    <Ionicons
                      name={(item.icon as any) || 'ellipse'}
                      size={14}
                      color={Colors.emergencyRedBright}
                    />
                  </View>
                  {!isLast && <View style={styles.timelineLine} />}
                </View>

                <View style={styles.timelineContent}>
                  <View style={styles.timelineHeaderRow}>
                    <Text style={styles.timelineItemTitle}>{item.title}</Text>
                    <Badge label={evtStatus} variant={badgeVariant as any} />
                  </View>
                  <Text style={styles.timelineItemTime}>
                    {formatDate(item.timestamp)}
                  </Text>
                  <Text style={styles.timelineItemDesc}>{item.description}</Text>
                  {item.latitude !== undefined && item.latitude !== null && (
                    <Text style={{ fontSize: 10, color: '#93C5FD', marginTop: 3 }}>
                      GPS: {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </Card>

      {/* Action Footer */}
      <View style={styles.footerArea}>
        {isAct ? (
          <Button
            title="Open Live Tracking Console"
            onPress={() => router.push({ pathname: '/sos', params: { id: incident.incident_id || incident.id } })}
            variant="emergency"
            size="lg"
            leftIcon={<Ionicons name="radio" size={18} color="#FFFFFF" />}
          />
        ) : (
          <Button
            title="Return to Incident Log"
            onPress={() => router.replace('/history')}
            variant="secondary"
            size="lg"
            leftIcon={<Ionicons name="list" size={18} color={Colors.textPrimary} />}
          />
        )}
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 15,
    marginTop: 14,
  },
  errorTitle: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 14,
  },
  errorSub: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 1,
  },
  mapCard: {
    padding: 12,
    marginBottom: 14,
  },
  mapHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  mapCardTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 6,
  },
  extMapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(30, 144, 255, 0.1)',
  },
  extMapText: {
    color: Colors.infoBlue,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  mapWrapper: {
    height: 190,
    borderRadius: 10,
    overflow: 'hidden',
  },
  mapFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  mapFooterText: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginLeft: 6,
    flex: 1,
  },
  metricsCard: {
    padding: 14,
    marginBottom: 14,
  },
  metricGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricItem: {
    flex: 1,
  },
  metricLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  metricValue: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  statusDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 12,
  },
  trackingStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackingStatusTitle: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  trackingStatusSub: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  recipientCard: {
    padding: 14,
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 8,
  },
  recipientBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  recipientName: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  recipientPhone: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  commActions: {
    flexDirection: 'row',
  },
  commIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  dispatchMetaBox: {
    marginTop: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 8,
    padding: 10,
  },
  dispatchMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 3,
  },
  metaFieldLabel: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  metaFieldValue: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  metaFieldValueWarning: {
    color: Colors.warningAmber,
    fontSize: 11,
    fontWeight: '600',
    maxWidth: '60%',
    textAlign: 'right',
  },
  statusDotSmall: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  messageContentLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 6,
  },
  messageContentBox: {
    backgroundColor: 'rgba(255, 59, 48, 0.06)',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: Colors.emergencyRedBright,
  },
  messageContentText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(30, 144, 255, 0.1)',
    borderRadius: 4,
  },
  copyText: {
    color: Colors.infoBlue,
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  descriptionCard: {
    padding: 14,
    marginBottom: 14,
  },
  descBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  descText: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  descTextEmpty: {
    color: Colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
  },
  voiceCard: {
    padding: 14,
    marginBottom: 14,
  },
  voicePlayerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.08)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.25)',
  },
  audioPlayButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.emergencyRedBright,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voicePlayTitle: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  voiceDuration: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  encryptedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(50, 215, 75, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  encryptedText: {
    color: Colors.safetyGreen,
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 3,
  },
  noVoiceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 8,
    padding: 12,
  },
  noVoiceText: {
    color: Colors.textMuted,
    fontSize: 13,
    marginLeft: 10,
  },
  timelineCard: {
    padding: 14,
    marginBottom: 16,
  },
  timelineList: {
    marginTop: 6,
  },
  timelineItem: {
    flexDirection: 'row',
    minHeight: 46,
  },
  timelineIconCol: {
    alignItems: 'center',
    width: 24,
    marginRight: 10,
  },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: Colors.border,
    marginVertical: 3,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 12,
  },
  timelineHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timelineItemTitle: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  timelineItemTime: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  timelineItemDesc: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  footerArea: {
    marginTop: 8,
  },
});
