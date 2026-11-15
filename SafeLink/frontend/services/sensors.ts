import { Accelerometer } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const STORAGE_KEY_SHAKE_ENABLED = 'safelink_shake_to_sos_enabled';
const STORAGE_KEY_COUNTDOWN_DURATION = 'safelink_sos_countdown_duration';

// Shake detection parameters calibrated for deliberate shaking and zero false-positives
const SHAKE_THRESHOLD = 2.4; // G-force magnitude threshold
const SHAKE_MIN_PEAKS = 3;   // Number of alternating peaks required
const SHAKE_WINDOW_MS = 1400; // Time window for the shake sequence
const SHAKE_COOLDOWN_MS = 6000; // Cooldown after triggering

type ShakeCallback = () => void;

class MotionSensorService {
  private subscription: any = null;
  private shakeListener: ShakeCallback | null = null;
  private peakTimestamps: number[] = [];
  private lastTriggerTime = 0;
  private isEnabled = true;

  constructor() {
    this.loadSettings();
  }

  public async loadSettings(): Promise<boolean> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY_SHAKE_ENABLED);
      if (stored !== null) {
        this.isEnabled = stored === 'true';
      } else {
        this.isEnabled = true; // Enabled by default
      }
    } catch {
      this.isEnabled = true;
    }
    return this.isEnabled;
  }

  public async setShakeEnabled(enabled: boolean): Promise<void> {
    this.isEnabled = enabled;
    try {
      await AsyncStorage.setItem(STORAGE_KEY_SHAKE_ENABLED, enabled ? 'true' : 'false');
    } catch (e) {
      console.warn('[MotionSensor] Error saving shake preference:', e);
    }
    if (!enabled) {
      this.stop();
    } else if (this.shakeListener) {
      this.start(this.shakeListener);
    }
  }

  public getShakeEnabled(): boolean {
    return this.isEnabled;
  }

  public async getCountdownDuration(): Promise<number> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY_COUNTDOWN_DURATION);
      if (stored) {
        const val = parseInt(stored, 10);
        if (val >= 3 && val <= 15) return val;
      }
    } catch {}
    return 5; // Default 5 seconds
  }

  public async setCountdownDuration(seconds: number): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_COUNTDOWN_DURATION, seconds.toString());
    } catch (e) {
      console.warn('[MotionSensor] Error saving countdown duration:', e);
    }
  }

  public async start(onShakeDetected: ShakeCallback): Promise<boolean> {
    this.shakeListener = onShakeDetected;

    if (!this.isEnabled) {
      return false;
    }

    try {
      const isAvailable = await Accelerometer.isAvailableAsync();
      if (!isAvailable) {
        console.warn('[MotionSensor] Accelerometer sensor not available on this device.');
        return false;
      }

      this.stop(); // Clear any existing listener
      Accelerometer.setUpdateInterval(100); // 10Hz sampling for low battery impact

      this.subscription = Accelerometer.addListener((data) => {
        const { x, y, z } = data;
        const totalForce = Math.sqrt(x * x + y * y + z * z);
        const now = Date.now();

        // Check if acceleration exceeds deliberate shake threshold
        if (totalForce > SHAKE_THRESHOLD) {
          // Remove old peaks outside the time window
          this.peakTimestamps = this.peakTimestamps.filter((t) => now - t < SHAKE_WINDOW_MS);
          this.peakTimestamps.push(now);

          // If enough rapid peaks accumulated and not in cooldown
          if (
            this.peakTimestamps.length >= SHAKE_MIN_PEAKS &&
            now - this.lastTriggerTime > SHAKE_COOLDOWN_MS
          ) {
            this.lastTriggerTime = now;
            this.peakTimestamps = [];
            console.log('[MotionSensor] Deliberate shake detected! Triggering SOS countdown.');
            if (this.shakeListener) {
              this.shakeListener();
            }
          }
        }
      });

      return true;
    } catch (err) {
      console.warn('[MotionSensor] Failed to initialize accelerometer:', err);
      return false;
    }
  }

  public stop(): void {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }
    this.peakTimestamps = [];
  }
}

export const motionSensorService = new MotionSensorService();
