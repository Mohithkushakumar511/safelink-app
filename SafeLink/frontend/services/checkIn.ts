import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const STORAGE_KEY_CHECKIN = 'safelink_check_in_state_v1';

export interface CheckInState {
  isActive: boolean;
  durationMinutes: number;
  startedAt: string; // ISO string
  expiresAt: string; // ISO string
  notificationId?: string;
  hasExpired: boolean;
}

type CheckInListener = (state: CheckInState | null) => void;

class CheckInService {
  private currentState: CheckInState | null = null;
  private timerInterval: any = null;
  private listeners: Set<CheckInListener> = new Set();

  constructor() {
    this.initNotifications();
    this.restoreState();
  }

  private async initNotifications() {
    try {
      if (Platform.OS === 'web') return;

      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    } catch {}
  }

  public subscribe(listener: CheckInListener): () => void {
    this.listeners.add(listener);
    listener(this.currentState);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): CheckInState | null {
    return this.currentState;
  }

  private notify() {
    this.listeners.forEach((fn) => fn(this.currentState));
  }

  public async restoreState(): Promise<CheckInState | null> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_CHECKIN);
      if (raw) {
        const state: CheckInState = JSON.parse(raw);
        const now = Date.now();
        const expiresTime = new Date(state.expiresAt).getTime();

        if (state.isActive) {
          if (now >= expiresTime) {
            state.hasExpired = true;
          }
          this.currentState = state;
          this.startLocalTick();
          this.notify();
          return state;
        }
      }
    } catch (e) {
      console.warn('[CheckInService] Restore error:', e);
    }
    this.currentState = null;
    this.notify();
    return null;
  }

  public async startCheckIn(durationMinutes: number): Promise<CheckInState> {
    await this.cancelCheckIn();

    const now = new Date();
    const expires = new Date(now.getTime() + durationMinutes * 60 * 1000);

    let notifId: string | undefined = undefined;
    try {
      if (Platform.OS !== 'web') {
        const perm = await Notifications.requestPermissionsAsync().catch(() => ({ granted: false } as any));
        if (perm && perm.granted) {
          notifId = await Notifications.scheduleNotificationAsync({
            content: {
              title: '⚠️ SafeLink Safety Check-In Reminder',
              body: `Your ${durationMinutes}-minute check-in timer has expired. Tap to confirm you are safe!`,
              data: { type: 'CHECK_IN_EXPIRED' },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: expires,
            },
          }).catch(() => undefined);
        }
      }
    } catch {}

    const state: CheckInState = {
      isActive: true,
      durationMinutes,
      startedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      notificationId: notifId,
      hasExpired: false,
    };

    this.currentState = state;
    await AsyncStorage.setItem(STORAGE_KEY_CHECKIN, JSON.stringify(state));
    this.startLocalTick();
    this.notify();
    return state;
  }

  public async markSafe(): Promise<void> {
    await this.cancelCheckIn();
  }

  public async cancelCheckIn(): Promise<void> {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    if (this.currentState?.notificationId) {
      try {
        await Notifications.cancelScheduledNotificationAsync(this.currentState.notificationId);
      } catch {}
    }

    this.currentState = null;
    await AsyncStorage.removeItem(STORAGE_KEY_CHECKIN);
    this.notify();
  }

  private startLocalTick() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = setInterval(() => {
      if (!this.currentState || !this.currentState.isActive) {
        clearInterval(this.timerInterval);
        return;
      }

      const now = Date.now();
      const expires = new Date(this.currentState.expiresAt).getTime();

      if (now >= expires && !this.currentState.hasExpired) {
        this.currentState.hasExpired = true;
        AsyncStorage.setItem(STORAGE_KEY_CHECKIN, JSON.stringify(this.currentState)).catch(() => {});
        this.notify();
      }
    }, 1000);
  }

  public getRemainingSeconds(): number {
    if (!this.currentState || !this.currentState.isActive) return 0;
    const diff = Math.floor((new Date(this.currentState.expiresAt).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  }
}

export const checkInService = new CheckInService();
