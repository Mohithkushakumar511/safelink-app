import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
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
import { useAuth } from '@/hooks/useAuth';

type FilterType = 'ALL' | 'ACTIVE' | 'RESOLVED' | 'CANCELLED';

export default function HistoryScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [incidents, setIncidents] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [isLoading, setIsLoading] = useState(true);

  const fetchHistory = async () => {
    if (!isAuthenticated || authLoading) return;
    setIsLoading(true);
    try {
      const data = await api.sos.getHistory();
      setIncidents(data);
    } catch (e: any) {
      Alert.alert('History Notice', formatApiError(e));
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
          fetchHistory();
        }
      }
    }, [authLoading, isAuthenticated])
  );

  const filteredList = incidents.filter((item) => {
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
    <ScreenWrapper style={styles.screen}>
      {/* Header */}
      <View style={styles.headerArea}>
        <Text style={styles.title}>Incident History</Text>
        <Text style={styles.subtitle}>
          Audit log of all emergency activations, GPS breadcrumbs, and resolutions
        </Text>
      </View>

      {/* Filter Chips */}
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

      {/* List */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.infoBlue} />
          <Text style={styles.loadingText}>Retrieving incident audit trail...</Text>
        </View>
      ) : filteredList.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Ionicons name="time-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No Emergency Incidents Found</Text>
          <Text style={styles.emptySub}>
            {filter === 'ALL'
              ? 'You have not triggered any SOS emergency alerts yet.'
              : `There are currently no incidents with status: ${filter}.`}
          </Text>
          <Button
            title="Return to Home"
            onPress={() => router.replace('/dashboard')}
            variant="secondary"
            size="md"
            style={{ marginTop: 16 }}
            leftIcon={<Ionicons name="home" size={16} color={Colors.textPrimary} />}
          />
        </Card>
      ) : (
        <FlatList
          data={filteredList}
          keyExtractor={(item) => item.id || item.incident_id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => {
            const isAct = item.status === 'ACTIVE';
            const isRes = item.status === 'RESOLVED';

            const badgeVariant = isAct ? 'danger' : isRes ? 'success' : 'warning';
            const initialAddr = item.initial_location?.address || item.address || 'GPS Coordinates Recorded';
            const latestAddr = item.latest_location?.address || item.address || initialAddr;

            return (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() =>
                  router.push({
                    pathname: '/incident-details',
                    params: { id: item.incident_id || item.id },
                  })
                }
              >
                <Card
                  style={[
                    styles.incidentCard,
                    isAct && styles.incidentCardActive,
                  ]}
                >
                  {/* Header: ID + Status Badge */}
                  <View style={styles.cardTopRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <View
                        style={[
                          styles.statusDot,
                          {
                            backgroundColor: isAct
                              ? Colors.emergencyRedBright
                              : isRes
                              ? Colors.safetyGreen
                              : Colors.warningAmber,
                          },
                        ]}
                      />
                      <Text style={styles.incidentIdText}>
                        Incident #{item.incident_id || item.id}
                      </Text>
                    </View>
                    <Badge label={item.status} variant={badgeVariant} />
                  </View>

                  {/* Activation Date & Duration Row */}
                  <View style={styles.metaRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
                      <Text style={styles.metaText}>
                        {formatDate(item.activated_at || item.timestamp)}
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name="stopwatch-outline" size={13} color={Colors.textMuted} />
                      <Text style={styles.metaText}>
                        Duration: {formatDuration(item.duration_seconds)}
                      </Text>
                    </View>
                  </View>

                  {/* Emergency Contact Notified */}
                  <View style={styles.infoRow}>
                    <Ionicons name="people-outline" size={15} color={Colors.infoBlue} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.infoLabel}>Emergency Contact Notified:</Text>
                      <Text style={styles.infoValue}>
                        {item.primary_contact_name || 'Emergency Responder'}
                        {item.primary_contact_phone ? ` (${item.primary_contact_phone})` : ''}
                      </Text>
                    </View>
                  </View>

                  {/* Initial Location */}
                  <View style={styles.infoRow}>
                    <Ionicons name="pin-outline" size={15} color={Colors.textMuted} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.infoLabel}>Initial Location:</Text>
                      <Text style={styles.infoValue} numberOfLines={1}>{initialAddr}</Text>
                    </View>
                  </View>

                  {/* Latest Known Location */}
                  <View style={styles.infoRow}>
                    <Ionicons name="navigate-outline" size={15} color={Colors.safetyGreen} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.infoLabel}>Latest Known Location:</Text>
                      <Text style={styles.infoValue} numberOfLines={1}>{latestAddr}</Text>
                    </View>
                  </View>

                  {/* Description if any */}
                  {item.emergency_description && (
                    <View style={styles.infoRow}>
                      <Ionicons name="document-text-outline" size={15} color={Colors.warningAmber} style={{ marginTop: 2 }} />
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={styles.infoLabel}>Description:</Text>
                        <Text style={styles.infoValue} numberOfLines={1}>"{item.emergency_description}"</Text>
                      </View>
                    </View>
                  )}

                  {/* Note / Reason if any */}
                  {(item.resolution_note || item.cancellation_reason) && (
                    <View style={styles.noteBox}>
                      <Text style={styles.noteLabel}>
                        {item.resolution_note ? 'Resolution Note:' : 'Cancellation Reason:'}
                      </Text>
                      <Text style={styles.noteText}>
                        {item.resolution_note || item.cancellation_reason}
                      </Text>
                    </View>
                  )}

                  {/* View Details / Open Tracking Button */}
                  <View style={{ flexDirection: 'row', marginTop: 12 }}>
                    <Button
                      title="Inspect Details"
                      onPress={() =>
                        router.push({
                          pathname: '/incident-details',
                          params: { id: item.incident_id || item.id },
                        })
                      }
                      variant="secondary"
                      size="sm"
                      style={{ flex: 1, marginRight: isAct ? 8 : 0 }}
                      leftIcon={
                        <Ionicons
                          name="document-text-outline"
                          size={15}
                          color="#FFFFFF"
                        />
                      }
                    />
                    {isAct && (
                      <Button
                        title="Live Console"
                        onPress={() =>
                          router.push({
                            pathname: '/sos',
                            params: { id: item.incident_id || item.id },
                          })
                        }
                        variant="emergency"
                        size="sm"
                        style={{ flex: 1 }}
                        leftIcon={<Ionicons name="radio" size={15} color="#FFFFFF" />}
                      />
                    )}
                  </View>
                </Card>
              </TouchableOpacity>
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
  },
  headerArea: {
    paddingTop: 8,
    marginBottom: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#101F42',
    borderWidth: 1,
    borderColor: '#1E356D',
  },
  filterChipActive: {
    backgroundColor: Colors.emergencyRedBright,
    borderColor: Colors.emergencyRedBright,
  },
  filterChipText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 10,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#101F42',
    borderColor: '#1E356D',
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 12,
  },
  emptySub: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  incidentCard: {
    padding: 15,
    backgroundColor: '#101F42',
    borderColor: '#1E356D',
    marginBottom: 12,
  },
  incidentCardActive: {
    borderColor: Colors.emergencyRedBright,
    borderWidth: 1.5,
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  incidentIdText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#172554',
  },
  metaText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  infoLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  infoValue: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  noteBox: {
    backgroundColor: '#0A142D',
    borderRadius: 6,
    padding: 8,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#172554',
  },
  noteLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  noteText: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
});
