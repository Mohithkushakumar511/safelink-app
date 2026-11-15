import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Colors } from '@/constants/colors';
import { api, formatApiError } from '@/services/api';
import { SosDispatchService } from '@/services/sos';
import { useAuth } from '@/hooks/useAuth';

type FilterType = 'ALL' | 'ACTIVE' | 'RESOLVED' | 'CANCELLED';

export default function AlertStatusScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [activeIncident, setActiveIncident] = useState<any | null>(null);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchAlertData = async () => {
    if (!isAuthenticated || authLoading) return;
    try {
      const [active, history] = await Promise.all([
        api.sos.getActive().catch(() => null),
        api.sos.getHistory().catch(() => []),
      ]);
      setActiveIncident(active);
      setIncidents(history || []);
    } catch (err: any) {
      console.warn('[AlertStatus] Data fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!authLoading) {
        if (!isAuthenticated) {
          router.replace('/login');
        } else {
          fetchAlertData();
        }
      }
    }, [authLoading, isAuthenticated])
  );

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchAlertData();
  };

  const handleOptionalWhatsApp = async (incident: any) => {
    const contactPhone =
      incident?.recipient_info?.recipient_phone ||
      incident?.primary_contact_phone;
    const msg =
      incident?.recipient_info?.message_content ||
      incident?.emergency_message ||
      'Emergency SOS Alert: Need assistance.';

    if (contactPhone) {
      await SosDispatchService.openWhatsApp(contactPhone, msg);
    } else {
      Alert.alert('No Contact Phone', 'No emergency contact phone number was found.');
    }
  };

  const filteredIncidents = incidents.filter((item) => {
    if (filter === 'ALL') return true;
    return item.status === filter;
  });

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

  return (
    <ScreenWrapper
      scrollable
      activeTab="alerts"
      contentContainerStyle={styles.container}
    >
      {/* Screen Header */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.headerTitle}>Alert Status Dashboard</Text>
          <Text style={styles.headerSub}>Live Telemetry, Dispatch Log & Verification</Text>
        </View>
        <TouchableOpacity
          onPress={onRefresh}
          style={styles.refreshIconBtn}
          activeOpacity={0.7}
          disabled={isRefreshing}
        >
          <Ionicons
            name="refresh"
            size={18}
            color={Colors.infoBlue}
          />
        </TouchableOpacity>
      </View>

      {/* ----------------------------------------------------------------- */}
      {/* SECTION 1: CURRENT ACTIVE INCIDENT (If any)                       */}
      {/* ----------------------------------------------------------------- */}
      {activeIncident ? (
        <Card style={styles.activeIncidentCard}>
          <View style={styles.activeCardHeader}>
            <View style={styles.beaconDot} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.activeCardBadge}>ACTIVE EMERGENCY DISPATCH</Text>
              <Text style={styles.activeCardId}>
                Incident #{activeIncident.incident_id || activeIncident.id}
              </Text>
            </View>
            <Badge label="ACTIVE" variant="danger" />
          </View>

          {/* Telemetry Grid */}
          <View style={styles.activeTelemetryBox}>
            <View style={styles.telemetryRow}>
              <View style={styles.telemetryCol}>
                <Text style={styles.telemetryLabel}>ACTIVATED AT</Text>
                <Text style={styles.telemetryValue}>
                  {formatDate(activeIncident.activated_at || activeIncident.timestamp)}
                </Text>
              </View>
              <View style={styles.telemetryCol}>
                <Text style={styles.telemetryLabel}>TRACKING STATUS</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                  <Ionicons name="pulse" size={14} color={Colors.emergencyRedBright} />
                  <Text style={[styles.telemetryValue, { color: Colors.emergencyRedBright, marginLeft: 4 }]}>
                    Live GPS (10s Interval)
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.telemetryDivider} />

            <View style={styles.telemetryRow}>
              <View style={styles.telemetryCol}>
                <Text style={styles.telemetryLabel}>GPS COORDINATES</Text>
                <Text style={styles.telemetryValue}>
                  {activeIncident.latest_location?.latitude
                    ? `${activeIncident.latest_location.latitude.toFixed(5)}, ${activeIncident.latest_location.longitude.toFixed(5)}`
                    : `${activeIncident.latitude.toFixed(5)}, ${activeIncident.longitude.toFixed(5)}`}
                </Text>
              </View>
              <View style={styles.telemetryCol}>
                <Text style={styles.telemetryLabel}>LAST UPDATE</Text>
                <Text style={styles.telemetryValue}>
                  {formatDate(activeIncident.last_location_update || activeIncident.activated_at)}
                </Text>
              </View>
            </View>

            <View style={styles.telemetryDivider} />

            <View style={styles.telemetryRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.telemetryLabel}>RECIPIENT CONTACT</Text>
                <Text style={styles.telemetryValue}>
                  {activeIncident.primary_contact_name || 'Emergency Responder'}
                  {activeIncident.primary_contact_phone ? ` (${activeIncident.primary_contact_phone})` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.telemetryLabel}>SMS SEND STATUS</Text>
                <Badge
                  label={activeIncident.recipient_info?.sending_status || 'SUBMITTED'}
                  variant="warning"
                  style={{ marginTop: 2 }}
                />
              </View>
            </View>

            {/* Battery Level Monitoring (Feature 5) */}
            {activeIncident.battery_level !== undefined && activeIncident.battery_level !== null && (
              <>
                <View style={styles.telemetryDivider} />
                <View style={styles.telemetryRow}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons
                      name={
                        activeIncident.battery_status === 'CHARGING'
                          ? 'battery-charging'
                          : activeIncident.battery_level <= 20
                          ? 'battery-dead'
                          : 'battery-full'
                      }
                      size={16}
                      color={
                        activeIncident.battery_level <= 20
                          ? Colors.emergencyRedBright
                          : activeIncident.battery_status === 'CHARGING'
                          ? Colors.infoBlue
                          : Colors.safetyGreen
                      }
                    />
                    <View style={{ marginLeft: 8 }}>
                      <Text style={styles.telemetryLabel}>DEVICE BATTERY</Text>
                      <Text style={styles.telemetryValue}>
                        {Math.round(activeIncident.battery_level)}% ({activeIncident.battery_status || 'Active'})
                      </Text>
                    </View>
                  </View>
                </View>
              </>
            )}

            {/* Chronological Incident Timeline (Feature 10) */}
            {activeIncident.timeline && activeIncident.timeline.length > 0 && (
              <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#2D1B28', paddingTop: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Ionicons name="time" size={14} color={Colors.infoBlue} />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: Colors.textSecondary, marginLeft: 6, letterSpacing: 0.5 }}>
                    CHRONOLOGICAL INCIDENT TIMELINE
                  </Text>
                </View>
                {activeIncident.timeline.slice(-4).map((evt: any, idx: number) => (
                  <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                    <Ionicons name="ellipse" size={8} color={Colors.emergencyRedBright} style={{ marginTop: 4, marginRight: 8 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: '#FFFFFF', fontWeight: '700' }}>{evt.title}</Text>
                      <Text style={{ fontSize: 10, color: Colors.textMuted }}>{evt.description}</Text>
                    </View>
                    <Text style={{ fontSize: 9, color: Colors.textMuted, marginLeft: 4 }}>
                      {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Action Row */}
          <View style={styles.activeActionRow}>
            <Button
              title="Live Console"
              onPress={() =>
                router.push({
                  pathname: '/sos',
                  params: { id: activeIncident.incident_id || activeIncident.id },
                })
              }
              variant="emergency"
              size="sm"
              style={{ flex: 1, marginRight: 6 }}
              leftIcon={<Ionicons name="radio" size={15} color="#FFFFFF" />}
            />
            <Button
              title="Full Dossier"
              onPress={() =>
                router.push({
                  pathname: '/incident-details',
                  params: { id: activeIncident.incident_id || activeIncident.id },
                })
              }
              variant="secondary"
              size="sm"
              style={{ flex: 1, marginRight: 6 }}
              leftIcon={<Ionicons name="document-text-outline" size={15} color="#FFFFFF" />}
            />
            <Button
              title="WhatsApp"
              onPress={() => handleOptionalWhatsApp(activeIncident)}
              variant="outline"
              size="sm"
              style={{ borderColor: '#25D366' }}
              textStyle={{ color: '#25D366' }}
              leftIcon={<Ionicons name="logo-whatsapp" size={15} color="#25D366" />}
            />
          </View>
        </Card>
      ) : (
        <Card style={styles.idleStatusCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="shield-checkmark" size={24} color={Colors.safetyGreen} />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={styles.idleTitle}>No Active SOS Alerts</Text>
              <Text style={styles.idleSub}>SafeLink protective monitoring is armed and standing by.</Text>
            </View>
          </View>
        </Card>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* SECTION 2: INCIDENT HISTORY & AUDIT TRAIL                         */}
      {/* ----------------------------------------------------------------- */}
      <View style={styles.historySectionHeader}>
        <Text style={styles.sectionHeading}>Emergency Incident Log</Text>
        <Text style={styles.sectionSubHeading}>
          Tap any incident card to inspect complete telemetry and messaging verification
        </Text>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(['ALL', 'ACTIVE', 'RESOLVED', 'CANCELLED'] as FilterType[]).map((tab) => {
          const isActive = filter === tab;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setFilter(tab)}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {tab}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Incident List */}
      {isLoading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="small" color={Colors.infoBlue} />
          <Text style={styles.loadingText}>Loading incident logs...</Text>
        </View>
      ) : filteredIncidents.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Ionicons name="notifications-off-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No Incidents Recorded</Text>
          <Text style={styles.emptySub}>
            {filter === 'ALL'
              ? 'No emergency alerts have been triggered on this account.'
              : `No incidents with status "${filter}" found.`}
          </Text>
        </Card>
      ) : (
        filteredIncidents.map((item) => {
          const isAct = item.status === 'ACTIVE';
          const isRes = item.status === 'RESOLVED';
          const badgeVariant = isAct ? 'danger' : isRes ? 'success' : 'warning';
          const addr =
            item.latest_location?.address ||
            item.initial_location?.address ||
            item.address ||
            'GPS Coordinates Recorded';

          const smsStatus =
            item.recipient_info?.sending_status ||
            (isAct ? 'SUBMITTED' : 'LOGGED');

          return (
            <TouchableOpacity
              key={item.id || item.incident_id}
              activeOpacity={0.8}
              onPress={() =>
                router.push({
                  pathname: '/incident-details',
                  params: { id: item.incident_id || item.id },
                })
              }
            >
              <Card style={[styles.historyCard, isAct && styles.historyCardActive]}>
                <View style={styles.historyCardTop}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Ionicons
                      name={isAct ? 'alert-circle' : isRes ? 'checkmark-circle' : 'close-circle'}
                      size={18}
                      color={isAct ? Colors.emergencyRedBright : isRes ? Colors.safetyGreen : Colors.warningAmber}
                    />
                    <Text style={styles.historyCardId}>
                      Incident #{item.incident_id || item.id}
                    </Text>
                  </View>
                  <Badge label={item.status} variant={badgeVariant} />
                </View>

                {/* Timing Row */}
                <View style={styles.historyMetaRow}>
                  <Text style={styles.historyMetaText}>
                    Activated: {formatDate(item.activated_at || item.timestamp)}
                  </Text>
                  <Text style={styles.historyMetaText}>
                    Duration: {formatDuration(item.duration_seconds)}
                  </Text>
                </View>

                {/* GPS Location Row */}
                <View style={styles.historyInfoRow}>
                  <Ionicons name="pin" size={14} color={Colors.textMuted} style={{ marginTop: 2 }} />
                  <Text style={styles.historyInfoText} numberOfLines={1}>
                    {addr}
                  </Text>
                </View>

                {/* Contact & SMS Status Row */}
                <View style={styles.historyFooterRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyContactText} numberOfLines={1}>
                      Dispatched: {item.primary_contact_name || 'Emergency Responder'}
                    </Text>
                  </View>
                  <View style={styles.smsBadgeBox}>
                    <Text style={styles.smsBadgeLabel}>SMS: {smsStatus}</Text>
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          );
        })
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingVertical: 6,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  headerSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  refreshIconBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIncidentCard: {
    padding: 14,
    backgroundColor: '#1C0D1B',
    borderColor: Colors.emergencyRedBright,
    borderWidth: 1.5,
    marginBottom: 16,
  },
  activeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  beaconDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.emergencyRedBright,
  },
  activeCardBadge: {
    color: Colors.emergencyRedBright,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  activeCardId: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 1,
  },
  activeTelemetryBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  telemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  telemetryCol: {
    flex: 1,
  },
  telemetryLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  telemetryValue: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  telemetryDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 8,
  },
  activeActionRow: {
    flexDirection: 'row',
  },
  idleStatusCard: {
    padding: 14,
    marginBottom: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  idleTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  idleSub: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  historySectionHeader: {
    marginBottom: 10,
  },
  sectionHeading: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionSubHeading: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  filterRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: Colors.surfaceLight,
    marginRight: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.emergencyRedBright,
    borderColor: Colors.emergencyRedBright,
  },
  filterChipText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  centerLoading: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 8,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  emptySub: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  historyCard: {
    padding: 12,
    marginBottom: 10,
  },
  historyCardActive: {
    borderColor: Colors.emergencyRedBright,
    borderWidth: 1.5,
  },
  historyCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  historyCardId: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6,
  },
  historyMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  historyMetaText: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  historyInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyInfoText: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginLeft: 6,
    flex: 1,
  },
  historyFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  historyContactText: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  smsBadgeBox: {
    backgroundColor: 'rgba(30, 144, 255, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  smsBadgeLabel: {
    color: Colors.infoBlue,
    fontSize: 10,
    fontWeight: '700',
  },
});
