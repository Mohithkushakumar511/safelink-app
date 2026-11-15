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
});
