import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { safeJourneyService, JourneyRecord } from '@/services/journey';
import { LocationData } from '@/services/location';

interface SafeJourneyModalProps {
  visible: boolean;
  onClose: () => void;
  currentLoc: LocationData | null;
}

export const SafeJourneyModal: React.FC<SafeJourneyModalProps> = ({
  visible,
  onClose,
  currentLoc,
}) => {
  const [activeJourney, setActiveJourney] = useState<JourneyRecord | null>(null);
  const [history, setHistory] = useState<JourneyRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const unsub = safeJourneyService.subscribe((journey) => {
      setActiveJourney(journey);
    });

    safeJourneyService.getHistory().then(setHistory);

    return () => unsub();
  }, []);

  const handleStart = async () => {
    if (!currentLoc) {
      Alert.alert('GPS Required', 'Acquiring GPS location before starting Safe Journey...');
      return;
    }
    await safeJourneyService.startJourney({
      latitude: currentLoc.latitude,
      longitude: currentLoc.longitude,
      accuracy: currentLoc.accuracy || undefined,
      address: currentLoc.address,
    });
  };

  const handleEnd = async () => {
    Alert.alert(
      'Complete Safe Journey',
      'Have you arrived safely at your destination? This will log your journey and stop live tracking.',
      [
        { text: 'Keep Tracking', style: 'cancel' },
        {
          text: 'Arrived Safely',
          style: 'default',
          onPress: async () => {
            const completed = await safeJourneyService.endJourney(currentLoc?.address);
            if (completed) {
              const updated = await safeJourneyService.getHistory();
              setHistory(updated);
            }
          },
        },
      ]
    );
  };

  const formatDuration = (secs: number) => {
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${s}s`;
    return `${mins}m ${s}s`;
  };

  const isTracking = activeJourney?.status === 'ACTIVE';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons
                name="navigate"
                size={22}
                color={isTracking ? Colors.safetyGreen : Colors.infoBlue}
              />
              <Text style={styles.title}>Safe Journey Companion</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.desc}>
            Continuously monitors your travel route, distance, and duration. Shares live telemetry
            with your emergency command center until you arrive safely.
          </Text>

          {/* ACTIVE TRACKING CONSOLE */}
          {isTracking ? (
            <View style={styles.activeConsole}>
              <View style={styles.liveTrackingBanner}>
                <View style={styles.liveDot} />
                <Text style={styles.liveTrackingText}>LIVE JOURNEY TRACKING ACTIVE</Text>
              </View>

              {/* Stats Grid */}
              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Ionicons name="time" size={20} color={Colors.infoBlue} />
                  <Text style={styles.statValue}>
                    {formatDuration(activeJourney.durationSeconds)}
                  </Text>
                  <Text style={styles.statLabel}>Journey Duration</Text>
                </View>

                <View style={styles.statBox}>
                  <Ionicons name="speedometer" size={20} color={Colors.safetyGreen} />
                  <Text style={styles.statValue}>
                    {activeJourney.distanceKm.toFixed(2)} km
                  </Text>
                  <Text style={styles.statLabel}>Distance Travelled</Text>
                </View>
              </View>

              {/* Current GPS Card */}
              <View style={styles.locationCard}>
                <Ionicons name="pin" size={16} color={Colors.emergencyRedBright} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.locationTitle}>Latest Waypoint</Text>
                  <Text style={styles.locationAddress} numberOfLines={2}>
                    {currentLoc?.address ||
                      `Lat: ${currentLoc?.latitude.toFixed(5)}, Lng: ${currentLoc?.longitude.toFixed(5)}`}
                  </Text>
                  <Text style={styles.locationSub}>
                    Accuracy: ±{currentLoc?.accuracy ? Math.round(currentLoc.accuracy) : 10}m •{' '}
                    {activeJourney.points.length} waypoints recorded
                  </Text>
                </View>
              </View>

              {/* End Journey Button */}
              <TouchableOpacity
                style={styles.endBtn}
                onPress={handleEnd}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-done-circle" size={22} color="#FFFFFF" />
                <Text style={styles.endBtnText}>ARRIVED SAFELY (END JOURNEY)</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* INACTIVE: START JOURNEY */
            <View>
              {/* Current GPS Snapshot */}
              <View style={styles.locationCard}>
                <Ionicons name="navigate-circle" size={20} color={Colors.infoBlue} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.locationTitle}>Departure Location</Text>
                  <Text style={styles.locationAddress} numberOfLines={2}>
                    {currentLoc?.address || 'Acquiring GPS fix...'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.startBtn}
                onPress={handleStart}
                activeOpacity={0.8}
              >
                <Ionicons name="play" size={20} color="#FFFFFF" />
                <Text style={styles.startBtnText}>START SAFE JOURNEY</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Toggle History */}
          <TouchableOpacity
            style={styles.toggleHistoryBtn}
            onPress={() => setShowHistory(!showHistory)}
            activeOpacity={0.7}
          >
            <Text style={styles.toggleHistoryText}>
              {showHistory ? '▲ Hide Journey History' : `▼ Past Journeys (${history.length})`}
            </Text>
          </TouchableOpacity>

          {showHistory && (
            <ScrollView style={styles.historyList} showsVerticalScrollIndicator={false}>
              {history.length === 0 ? (
                <Text style={styles.emptyText}>No previous journeys recorded yet.</Text>
              ) : (
                history.map((j) => (
                  <View key={j.id} style={styles.historyItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyDate}>
                        {new Date(j.startedAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                      <Text style={styles.historyDest} numberOfLines={1}>
                        {j.endAddress || j.startAddress || 'Local Travel'}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.historyDist}>{j.distanceKm.toFixed(2)} km</Text>
                      <Text style={styles.historyDur}>{formatDuration(j.durationSeconds)}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 10, 25, 0.85)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: '#1E293B',
    elevation: 25,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginLeft: 10,
  },
  closeBtn: {
    padding: 4,
  },
  desc: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 18,
    lineHeight: 18,
  },
  activeConsole: {
    gap: 12,
  },
  liveTrackingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 1,
    borderColor: Colors.safetyGreen,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.safetyGreen,
    marginRight: 8,
  },
  liveTrackingText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.safetyGreen,
    letterSpacing: 0.5,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 14,
  },
  locationTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },
  locationAddress: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
    marginTop: 2,
  },
  locationSub: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 4,
    marginBottom: 10,
  },
  startBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 8,
    letterSpacing: 0.5,
  },
  endBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16A34A',
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 6,
  },
  endBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 8,
    letterSpacing: 0.5,
  },
  toggleHistoryBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  toggleHistoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  historyList: {
    maxHeight: 180,
    marginTop: 4,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  historyDate: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  historyDest: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  historyDist: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.safetyGreen,
  },
  historyDur: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 12,
    color: Colors.textMuted,
    paddingVertical: 14,
  },
});
