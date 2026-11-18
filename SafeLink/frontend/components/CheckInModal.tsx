import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { checkInService, CheckInState } from '@/services/checkIn';

interface CheckInModalProps {
  visible: boolean;
  onClose: () => void;
  onEscalateSos: () => void;
}

const PRESET_DURATIONS = [
  { label: '5 Mins', minutes: 5 },
  { label: '15 Mins', minutes: 15 },
  { label: '30 Mins', minutes: 30 },
  { label: '60 Mins', minutes: 60 },
];

export const CheckInModal: React.FC<CheckInModalProps> = ({
  visible,
  onClose,
  onEscalateSos,
}) => {
  const [checkInState, setCheckInState] = useState<CheckInState | null>(null);
  const [selectedMinutes, setSelectedMinutes] = useState(15);
  const [remainingSecs, setRemainingSecs] = useState(0);

  useEffect(() => {
    const unsub = checkInService.subscribe((state) => {
      setCheckInState(state);
      if (state?.isActive) {
        setRemainingSecs(checkInService.getRemainingSeconds());
      }
    });

    const interval = setInterval(() => {
      if (checkInService.getState()?.isActive) {
        setRemainingSecs(checkInService.getRemainingSeconds());
      }
    }, 1000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  const handleStart = async () => {
    await checkInService.startCheckIn(selectedMinutes);
  };

  const handleMarkSafe = async () => {
    await checkInService.markSafe();
    Alert.alert('Status Confirmed', 'You are marked safe. Check-in timer cancelled.');
    onClose();
  };

  const handleEscalate = () => {
    onClose();
    onEscalateSos();
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isActive = checkInState?.isActive;
  const hasExpired = checkInState?.hasExpired;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons
                name="shield-checkmark"
                size={22}
                color={hasExpired ? Colors.emergencyRedBright : Colors.safetyGreen}
              />
              <Text style={styles.title}>Safety Check-In Timer</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.desc}>
            Set a timer when entering an unfamiliar situation. If you don't check in before it
            expires, SafeLink prompts you and provides 1-tap SOS escalation.
          </Text>

          {/* ACTIVE STATE */}
          {isActive ? (
            <View style={styles.activeContainer}>
              <View
                style={[
                  styles.timerCircle,
                  hasExpired && styles.timerCircleExpired,
                ]}
              >
                <Ionicons
                  name={hasExpired ? 'alert-circle' : 'time-outline'}
                  size={36}
                  color={hasExpired ? Colors.emergencyRedBright : Colors.safetyGreen}
                />
                <Text
                  style={[
                    styles.timerNumber,
                    hasExpired && styles.timerNumberExpired,
                  ]}
                >
                  {hasExpired ? 'EXPIRED' : formatTime(remainingSecs)}
                </Text>
                <Text style={styles.timerSub}>
                  {hasExpired
                    ? 'Check-In Window Passed'
                    : `Remaining of ${checkInState.durationMinutes}m window`}
                </Text>
              </View>

              {hasExpired && (
                <View style={styles.expiredAlertBox}>
                  <Text style={styles.expiredAlertText}>
                    Are you safe? No response recorded yet. You can mark yourself safe or immediately
                    escalate to Emergency SOS.
                  </Text>
                </View>
              )}

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.safeBtn}
                  onPress={handleMarkSafe}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                  <Text style={styles.safeBtnText}>I AM SAFE (CLEAR TIMER)</Text>
                </TouchableOpacity>

                {hasExpired && (
                  <TouchableOpacity
                    style={styles.escalateBtn}
                    onPress={handleEscalate}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="warning" size={20} color="#FFFFFF" />
                    <Text style={styles.escalateBtnText}>ACTIVATE SOS DISPATCH</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ) : (
            /* CONFIGURATION / INACTIVE STATE */
            <View>
              <Text style={styles.sectionLabel}>Select Check-In Duration:</Text>
              <View style={styles.presetsGrid}>
                {PRESET_DURATIONS.map((p) => {
                  const selected = selectedMinutes === p.minutes;
                  return (
                    <TouchableOpacity
                      key={p.minutes}
                      style={[styles.presetCard, selected && styles.presetCardActive]}
                      onPress={() => setSelectedMinutes(p.minutes)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.presetText,
                          selected && styles.presetTextActive,
                        ]}
                      >
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={styles.startBtn}
                onPress={handleStart}
                activeOpacity={0.8}
              >
                <Ionicons name="play" size={20} color="#FFFFFF" />
                <Text style={styles.startBtnText}>
                  START {selectedMinutes}-MIN CHECK-IN
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.privacyNote}>
            🛡️ SafeLink will never automatically dispatch emergency contacts without your explicit
            consent.
          </Text>
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
    marginBottom: 20,
    lineHeight: 18,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  presetsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 20,
  },
  presetCard: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  presetCardActive: {
    borderColor: Colors.safetyGreen,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  presetText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  presetTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 4,
  },
  startBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
    letterSpacing: 0.5,
  },
  activeContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  timerCircle: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 4,
    borderColor: Colors.safetyGreen,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  timerCircleExpired: {
    borderColor: Colors.emergencyRedBright,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  timerNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.safetyGreen,
    marginTop: 4,
  },
  timerNumberExpired: {
    fontSize: 22,
    color: Colors.emergencyRedBright,
  },
  timerSub: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  expiredAlertBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: Colors.emergencyRedBright,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    width: '100%',
  },
  expiredAlertText: {
    fontSize: 12,
    color: '#FECACA',
    lineHeight: 16,
    textAlign: 'center',
  },
  actionRow: {
    width: '100%',
    gap: 10,
  },
  safeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16A34A',
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 4,
  },
  safeBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 8,
  },
  escalateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.emergencyRedBright,
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 6,
  },
  escalateBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 8,
  },
  privacyNote: {
    textAlign: 'center',
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 18,
    lineHeight: 15,
  },
});
