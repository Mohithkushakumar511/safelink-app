import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView } from 'expo-camera';
import { Colors } from '@/constants/colors';

interface FlashlightSosModalProps {
  visible: boolean;
  onClose: () => void;
}

// Morse SOS pattern: Short (200ms), Long (600ms), Gap (200ms), Letter Gap (600ms), Word Gap (1400ms)
// S: . . . (on 200, off 200, on 200, off 200, on 200, off 600)
// O: - - - (on 600, off 200, on 600, off 200, on 600, off 600)
// S: . . . (on 200, off 200, on 200, off 200, on 200, off 1400)
const MORSE_PATTERN = [
  // 'S'
  { on: true, ms: 200 },
  { on: false, ms: 200 },
  { on: true, ms: 200 },
  { on: false, ms: 200 },
  { on: true, ms: 200 },
  { on: false, ms: 600 },
  // 'O'
  { on: true, ms: 600 },
  { on: false, ms: 200 },
  { on: true, ms: 600 },
  { on: false, ms: 200 },
  { on: true, ms: 600 },
  { on: false, ms: 600 },
  // 'S'
  { on: true, ms: 200 },
  { on: false, ms: 200 },
  { on: true, ms: 200 },
  { on: false, ms: 200 },
  { on: true, ms: 200 },
  { on: false, ms: 1400 },
];

export const FlashlightSosModal: React.FC<FlashlightSosModalProps> = ({
  visible,
  onClose,
}) => {
  const [isTorchActive, setIsTorchActive] = useState(false);
  const [torchMode, setTorchMode] = useState<'SOS' | 'STEADY'>('SOS');
  const [screenStrobe, setScreenStrobe] = useState(false);

  const patternIndexRef = useRef(0);
  const timeoutRef = useRef<any>(null);
  const pulseAnim = useRef(new Animated.Value(0)).current;

  // Cleanup immediately whenever modal closes
  useEffect(() => {
    if (!visible) {
      stopFlashlight();
    }
    return () => {
      stopFlashlight();
    };
  }, [visible]);

  const stopFlashlight = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsTorchActive(false);
    setScreenStrobe(false);
    patternIndexRef.current = 0;
  };

  const startFlashlight = (mode: 'SOS' | 'STEADY' = torchMode) => {
    stopFlashlight();
    setIsTorchActive(true);

    if (mode === 'STEADY') {
      setScreenStrobe(true);
    } else {
      // SOS Morse pattern runner
      patternIndexRef.current = 0;
      runNextMorseStep();
    }
  };

  const runNextMorseStep = () => {
    const step = MORSE_PATTERN[patternIndexRef.current];
    setScreenStrobe(step.on);

    timeoutRef.current = setTimeout(() => {
      patternIndexRef.current = (patternIndexRef.current + 1) % MORSE_PATTERN.length;
      runNextMorseStep();
    }, step.ms);
  };

  const toggleFlashlight = () => {
    if (isTorchActive) {
      stopFlashlight();
    } else {
      startFlashlight(torchMode);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        {/* Full screen visual beacon flash (ensures emergency visibility on all devices) */}
        {screenStrobe && <View style={styles.screenStrobeOverlay} />}

        {/* Hidden CameraView to drive hardware torch */}
        {isTorchActive && (
          <View style={styles.hiddenCamera}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={screenStrobe}
            />
          </View>
        )}

        <View style={styles.modalCard}>
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons
                name="flashlight"
                size={22}
                color={isTorchActive ? Colors.safetyGreen : Colors.textMuted}
              />
              <Text style={styles.modalTitle}>Flashlight SOS Beacon</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                stopFlashlight();
                onClose();
              }}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={24} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.modalDescription}>
            Dispatches high-visibility emergency visual signals using your camera flash and
            strobe screen beacon.
          </Text>

          {/* Mode Selector */}
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[
                styles.modeBtn,
                torchMode === 'SOS' && styles.modeBtnActive,
              ]}
              onPress={() => {
                setTorchMode('SOS');
                if (isTorchActive) startFlashlight('SOS');
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name="warning"
                size={18}
                color={torchMode === 'SOS' ? Colors.emergencyRedBright : Colors.textMuted}
              />
              <Text
                style={[
                  styles.modeBtnText,
                  torchMode === 'SOS' && styles.modeBtnTextActive,
                ]}
              >
                SOS Morse Code (• • • — — — • • •)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeBtn,
                torchMode === 'STEADY' && styles.modeBtnActive,
              ]}
              onPress={() => {
                setTorchMode('STEADY');
                if (isTorchActive) startFlashlight('STEADY');
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name="sunny"
                size={18}
                color={torchMode === 'STEADY' ? Colors.warningAmber : Colors.textMuted}
              />
              <Text
                style={[
                  styles.modeBtnText,
                  torchMode === 'STEADY' && styles.modeBtnTextActive,
                ]}
              >
                Steady High-Beam Torch
              </Text>
            </TouchableOpacity>
          </View>

          {/* Main Big Toggle Button */}
          <TouchableOpacity
            style={[
              styles.actionButton,
              isTorchActive ? styles.actionButtonStop : styles.actionButtonStart,
            ]}
            onPress={toggleFlashlight}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isTorchActive ? 'stop-circle' : 'flash'}
              size={28}
              color="#FFFFFF"
            />
            <Text style={styles.actionButtonText}>
              {isTorchActive ? 'STOP FLASHLIGHT' : 'START SOS SIGNAL'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.footerNote}>
            {isTorchActive
              ? '● Visual beacon active. Automatically turns off when exiting.'
              : 'Tap to start controlled flashing signal.'}
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 10, 25, 0.85)',
    justifyContent: 'flex-end',
  },
  screenStrobeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    zIndex: 99999,
    opacity: 0.95,
  },
  hiddenCamera: {
    width: 1,
    height: 1,
    opacity: 0.01,
    position: 'absolute',
  },
  modalCard: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1E293B',
    elevation: 25,
    zIndex: 100000,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginLeft: 10,
  },
  closeBtn: {
    padding: 4,
  },
  modalDescription: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 20,
    lineHeight: 18,
  },
  modeRow: {
    gap: 10,
    marginBottom: 24,
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  modeBtnActive: {
    borderColor: Colors.emergencyRedBright,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
    marginLeft: 10,
  },
  modeBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    elevation: 8,
  },
  actionButtonStart: {
    backgroundColor: Colors.emergencyRedBright,
  },
  actionButtonStop: {
    backgroundColor: '#334155',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginLeft: 10,
    letterSpacing: 0.5,
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 14,
  },
});
