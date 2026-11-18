import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { SafeLinkMapView } from '@/components/MapView';
import { Colors } from '@/constants/colors';
import { api, formatApiError } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'expo-router';

type IncidentFilter = 'ALL' | 'ACTIVE' | 'CANCELLED' | 'RESOLVED';

export default function AdminIncidentsScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [incidents, setIncidents] = useState<any[]>([]);
  const [filter, setFilter] = useState<IncidentFilter>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchIncidents = async () => {
    if (!isAuthenticated || authLoading) return;
    setIsLoading(true);
    try {
      const data = await api.admin.getIncidents(filter);
      setIncidents(data);
    } catch (e: any) {
      Alert.alert('Error', formatApiError(e));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated || user?.role !== 'ADMIN') {
        router.replace('/dashboard');
      } else {
        fetchIncidents();
      }
    }
  }, [filter, authLoading, isAuthenticated, user?.role]);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleAdminCancel = (item: any) => {
    const incId = item.incident_id || item.id;
    Alert.alert(
      'Cancel User SOS',
      `Are you sure you want to cancel the active SOS alert for ${item.user_name || 'this user'}?`,
      [
        { text: 'Keep Active', style: 'cancel' },
        {
          text: 'Cancel SOS',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.sos.cancel(incId, 'Cancelled by System Administrator');
              Alert.alert('Alert Cancelled', `Incident #${incId} has been cancelled.`);
              fetchIncidents();
            } catch (err: any) {
              Alert.alert('Action Failed', formatApiError(err));
            }
          },
        },
      ]
    );
  };

  const handleAdminResolve = (item: any) => {
    const incId = item.incident_id || item.id;
    Alert.alert(
      'Resolve Emergency Incident',
      `Mark incident #${incId} as safely resolved?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Resolved',
          onPress: async () => {
            try {
              await api.sos.resolve(incId, 'Marked safely resolved by Administrator');
              Alert.alert('Incident Resolved', `Incident #${incId} marked as resolved.`);
              fetchIncidents();
            } catch (err: any) {
              Alert.alert('Action Failed', formatApiError(err));
            }
          },
        },
      ]
    );
  };

  return (
    <ScreenWrapper style={styles.screen}>
      <Text style={styles.title}>All Emergency Incidents</Text>
      <Text style={styles.sub}>Centralized telemetry from all registered devices</Text>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(['ALL', 'ACTIVE', 'CANCELLED', 'RESOLVED'] as IncidentFilter[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setFilter(tab)}
            style={[styles.filterTab, filter === tab && styles.filterTabActive]}
          >
            <Text
              style={[
                styles.filterTabText,
                filter === tab && styles.filterTabTextActive,
              ]}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.warningAmber} />
        </View>
      ) : incidents.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Ionicons name="shield-outline" size={44} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No Incidents Found</Text>
          <Text style={styles.emptySub}>No emergency records found matching filter "{filter}".</Text>
        </Card>
      ) : (
        <FlatList
          data={incidents}
          keyExtractor={(item) => item.id || item.incident_id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isExpanded = expandedId === (item.id || item.incident_id);
            return (
              <Card style={styles.incidentCard}>
                <TouchableOpacity
                  onPress={() => toggleExpand(item.id || item.incident_id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.incidentHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.incidentId}>#{item.incident_id || item.id}</Text>
                      <Text style={styles.incidentUser}>
                        User: {item.user_name || 'Mohith'}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Badge
                        label={item.status}
                        variant={
                          item.status === 'ACTIVE'
                            ? 'danger'
                            : item.status === 'RESOLVED'
                            ? 'success'
                            : 'warning'
                        }
                      />
                      {item.created_offline && (
                        <Badge label="OFFLINE ORIGIN" variant="warning" />
                      )}
                      {item.connectivity_status === 'OFFLINE_SYNCED' && (
                        <Badge label="CLOUD SYNCED" variant="info" />
                      )}
                      {item.escalation && (
                        <Badge
                          label={
                            item.escalation.status === 'ACKNOWLEDGED'
                              ? `L${item.escalation.level} ACKNOWLEDGED`
                              : item.escalation.status === 'EXHAUSTED'
                              ? 'LADDER EXHAUSTED'
                              : `ESCALATION L${item.escalation.level}`
                          }
                          variant={
                            item.escalation.status === 'ACKNOWLEDGED'
                              ? 'success'
                              : item.escalation.status === 'EXHAUSTED'
                              ? 'warning'
                              : 'danger'
                          }
                        />
                      )}
                    </View>
                  </View>

                  <Text style={styles.detailsText}>{item.status_details}</Text>

                  <View style={styles.footerRow}>
                    <Text style={styles.coordsText}>
                      LAT: {item.latitude.toFixed(4)}, LNG: {item.longitude.toFixed(4)}
                    </Text>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={Colors.textMuted}
                    />
                  </View>
                </TouchableOpacity>

                {/* Expanded Map and Telemetry */}
                {isExpanded && item.latitude !== 0 && (
                  <View style={styles.expandedSection}>
                    <Text style={styles.expandedTitle}>INCIDENT DISPATCH MAP</Text>
                    <SafeLinkMapView
                      latitude={item.latitude}
                      longitude={item.longitude}
                      accuracy={item.accuracy}
                      markerTitle={`Incident #${item.incident_id || item.id}`}
                      isEmergency={item.status === 'ACTIVE'}
                      zoom={16}
                      style={{ height: 180, marginTop: 8 }}
                    />
                  </View>
                )}

                {/* Escalation Telemetry Summary */}
                {isExpanded && item.escalation && (
                  <View style={styles.adminEscalationBox}>
                    <View style={styles.adminSectionHeaderRow}>
                      <Ionicons name="git-network-outline" size={15} color={Colors.infoBlue} />
                      <Text style={styles.adminSectionTitle}>ESCALATION STATUS</Text>
                    </View>
                    <View style={styles.adminEscalationRow}>
                      <Text style={styles.adminEscalationLabel}>Current Level:</Text>
                      <Text style={styles.adminEscalationVal}>Level {item.escalation.level || 1} ({item.escalation.level === 1 ? 'Primary' : item.escalation.level === 2 ? 'Secondary' : 'Tertiary'})</Text>
                    </View>
                    <View style={styles.adminEscalationRow}>
                      <Text style={styles.adminEscalationLabel}>Target Responder:</Text>
                      <Text style={styles.adminEscalationVal}>{item.escalation.current_contact_name || item.primary_contact_name || 'Emergency Responder'} ({item.escalation.current_contact_phone || item.primary_contact_phone || 'N/A'})</Text>
                    </View>
                    <View style={styles.adminEscalationRow}>
                      <Text style={styles.adminEscalationLabel}>Attempts:</Text>
                      <Text style={styles.adminEscalationVal}>{item.escalation.attempts || 1} attempt(s)</Text>
                    </View>
                    <View style={styles.adminEscalationRow}>
                      <Text style={styles.adminEscalationLabel}>Status:</Text>
                      <Text style={[styles.adminEscalationVal, { color: item.escalation.status === 'ACKNOWLEDGED' ? Colors.safetyGreen : Colors.warningAmber }]}>
                        {item.escalation.status === 'ACKNOWLEDGED'
                          ? `Acknowledged by ${item.escalation.acknowledged_by?.contact_name || 'Responder'} (${item.escalation.acknowledged_by?.response_status || 'Responding'})`
                          : item.escalation.status === 'EXHAUSTED'
                          ? 'Escalation Ladder Exhausted'
                          : `Waiting for Acknowledgement (${item.escalation.timeout_seconds || 120}s timeout)`}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Connectivity Intelligence Telemetry Box */}
                {isExpanded && (
                  <View style={styles.adminEscalationBox}>
                    <View style={styles.adminSectionHeaderRow}>
                      <Ionicons name="wifi-outline" size={15} color={Colors.infoBlue} />
                      <Text style={styles.adminSectionTitle}>CONNECTIVITY & DELIVERY INTELLIGENCE</Text>
                    </View>
                    <View style={styles.adminEscalationRow}>
                      <Text style={styles.adminEscalationLabel}>Dispatch Origin:</Text>
                      <Text style={[styles.adminEscalationVal, { color: item.created_offline ? Colors.warningAmber : Colors.safetyGreen }]}>
                        {item.created_offline ? 'Offline Triggered (Direct Cellular SMS)' : 'Direct Cloud API Dispatch'}
                      </Text>
                    </View>
                    <View style={styles.adminEscalationRow}>
                      <Text style={styles.adminEscalationLabel}>Cloud Sync Status:</Text>
                      <Text style={styles.adminEscalationVal}>
                        {item.created_offline
                          ? item.offline_synced_at
                            ? `Synchronized at ${new Date(item.offline_synced_at).toLocaleTimeString()}`
                            : 'Pending Cloud Synchronization'
                          : 'Immediate Live Connection'}
                      </Text>
                    </View>
                    <View style={styles.adminEscalationRow}>
                      <Text style={styles.adminEscalationLabel}>Sync Retry Attempts:</Text>
                      <Text style={styles.adminEscalationVal}>{item.retry_count ? `${item.retry_count} attempt(s)` : '1 attempt (Direct)'}</Text>
                    </View>
                    <View style={styles.adminEscalationRow}>
                      <Text style={styles.adminEscalationLabel}>GPS Accuracy:</Text>
                      <Text style={styles.adminEscalationVal}>
                        {item.accuracy ? `±${Math.round(item.accuracy)}m (${item.accuracy <= 25 ? 'High Satellite' : item.accuracy <= 70 ? 'Fair' : 'Poor'})` : 'Standard Location Fix'}
                      </Text>
                    </View>
                    <View style={styles.adminEscalationRow}>
                      <Text style={styles.adminEscalationLabel}>Delivery Channel:</Text>
                      <Text style={styles.adminEscalationVal}>
                        {item.recipient_info?.sending_method || 'SMS'} ({item.recipient_info?.sending_status || 'SUBMITTED'})
                      </Text>
                    </View>
                  </View>
                )}

                {/* Complete Emergency Event Timeline */}
                {isExpanded && item.timeline && item.timeline.length > 0 && (
                  <View style={styles.adminTimelineBox}>
                    <View style={styles.adminSectionHeaderRow}>
                      <Ionicons name="time-outline" size={15} color={Colors.infoBlue} />
                      <Text style={styles.adminSectionTitle}>EMERGENCY EVENT TIMELINE ({item.timeline.length})</Text>
                    </View>
                    {item.timeline.map((evt: any, idx: number) => {
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
                        <View key={evt.id || idx} style={styles.adminTimelineItem}>
                          <View style={styles.adminTimelineDot} />
                          <View style={{ flex: 1, marginLeft: 8 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text style={styles.adminTimelineTitle}>{evt.title}</Text>
                              <Badge label={evtStatus} variant={badgeVariant as any} />
                            </View>
                            <Text style={styles.adminTimelineTime}>
                              {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </Text>
                            <Text style={styles.adminTimelineDesc}>{evt.description}</Text>
                            {evt.latitude !== undefined && evt.latitude !== null && (
                              <Text style={styles.adminTimelineCoords}>
                                Lat: {evt.latitude.toFixed(5)}, Lng: {evt.longitude.toFixed(5)}
                              </Text>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Admin Actions for Active Incidents */}
                {isExpanded && item.status === 'ACTIVE' && (
                  <View style={styles.adminActionRow}>
                    <Button
                      title="Mark Resolved"
                      onPress={() => handleAdminResolve(item)}
                      variant="secondary"
                      size="sm"
                      style={{ flex: 1, marginRight: 6 }}
                      leftIcon={<Ionicons name="checkmark-done" size={15} color={Colors.safetyGreen} />}
                    />
                    <Button
                      title="Cancel Alert"
                      onPress={() => handleAdminCancel(item)}
                      variant="danger"
                      size="sm"
                      style={{ flex: 1, marginLeft: 6 }}
                      leftIcon={<Ionicons name="close-circle-outline" size={15} color="#FFFFFF" />}
                    />
                  </View>
                )}
              </Card>
            );
          }}
        />
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  sub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
    marginBottom: 14,
  },
  filterRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  filterTabActive: {
    backgroundColor: Colors.warningAmber,
  },
  filterTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  filterTabTextActive: {
    color: '#0A1128',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 36,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 10,
  },
  emptySub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
  },
  incidentCard: {
    marginBottom: 12,
  },
  incidentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  incidentId: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  incidentUser: {
    fontSize: 12,
    color: Colors.infoBlue,
    fontWeight: '600',
    marginTop: 2,
  },
  detailsText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginVertical: 4,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingTop: 8,
    marginTop: 6,
  },
  coordsText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: 'monospace',
  },
  expandedSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  adminActionRow: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  expandedTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  adminEscalationBox: {
    backgroundColor: '#0A142D',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#1E356D',
  },
  adminSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  adminSectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.infoBlue,
    letterSpacing: 0.8,
  },
  adminEscalationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  adminEscalationLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  adminEscalationVal: {
    fontSize: 11,
    color: Colors.textPrimary,
    fontWeight: '700',
    maxWidth: '65%',
    textAlign: 'right',
  },
  adminTimelineBox: {
    backgroundColor: '#0A142D',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#1E356D',
  },
  adminTimelineItem: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#172554',
  },
  adminTimelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.infoBlue,
    marginTop: 4,
  },
  adminTimelineTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    flex: 1,
  },
  adminTimelineTime: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
  },
  adminTimelineDesc: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 15,
  },
  adminTimelineCoords: {
    fontSize: 10,
    color: '#93C5FD',
    fontFamily: 'monospace',
    marginTop: 2,
  },
});
