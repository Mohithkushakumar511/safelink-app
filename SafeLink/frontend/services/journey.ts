import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { api } from './api';

const ACTIVE_JOURNEY_KEY = 'safelink_active_journey_v1';
const JOURNEY_HISTORY_KEY = 'safelink_journey_history_v1';

export interface JourneyPoint {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  speed?: number;
  timestamp: string;
}

export interface JourneyRecord {
  id: string;
  startedAt: string;
  endedAt?: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  durationSeconds: number;
  distanceKm: number;
  points: JourneyPoint[];
  startAddress?: string;
  endAddress?: string;
}

type JourneyListener = (journey: JourneyRecord | null) => void;

// Haversine formula to compute great-circle distance between two GPS coordinates in kilometers
function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

class SafeJourneyService {
  private activeJourney: JourneyRecord | null = null;
  private locationSub: Location.LocationSubscription | null = null;
  private timerInterval: any = null;
  private listeners: Set<JourneyListener> = new Set();

  constructor() {
    this.restoreActiveJourney();
  }

  public subscribe(listener: JourneyListener): () => void {
    this.listeners.add(listener);
    listener(this.activeJourney);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => fn(this.activeJourney));
  }

  public async restoreActiveJourney(): Promise<JourneyRecord | null> {
    try {
      const raw = await AsyncStorage.getItem(ACTIVE_JOURNEY_KEY);
      if (raw) {
        const parsed: JourneyRecord = JSON.parse(raw);
        if (parsed.status === 'ACTIVE') {
          this.activeJourney = parsed;
          this.startLocationWatch();
          this.startTimer();
          this.notify();
          return parsed;
        }
      }
    } catch {}
    this.activeJourney = null;
    this.notify();
    return null;
  }

  public async startJourney(initialLocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    address?: string;
  }): Promise<JourneyRecord> {
    if (this.activeJourney) {
      await this.endJourney();
    }

    const now = new Date();
    const id = `JRN-${now.getTime()}`;

    const points: JourneyPoint[] = [];
    if (initialLocation) {
      points.push({
        latitude: initialLocation.latitude,
        longitude: initialLocation.longitude,
        accuracy: initialLocation.accuracy,
        timestamp: now.toISOString(),
      });
    }

    const newJourney: JourneyRecord = {
      id,
      startedAt: now.toISOString(),
      status: 'ACTIVE',
      durationSeconds: 0,
      distanceKm: 0,
      points,
      startAddress: initialLocation?.address || 'Initial GPS Point',
    };

    this.activeJourney = newJourney;
    await AsyncStorage.setItem(ACTIVE_JOURNEY_KEY, JSON.stringify(newJourney));

    // Send initial journey start location update to backend
    if (initialLocation) {
      api.location.update({
        latitude: initialLocation.latitude,
        longitude: initialLocation.longitude,
        accuracy: initialLocation.accuracy,
        address: initialLocation.address,
        is_live_sharing: true,
      }).catch(() => {});
    }

    this.startLocationWatch();
    this.startTimer();
    this.notify();
    return newJourney;
  }

  private startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (!this.activeJourney || this.activeJourney.status !== 'ACTIVE') {
        clearInterval(this.timerInterval);
        return;
      }
      const elapsed = Math.floor(
        (Date.now() - new Date(this.activeJourney.startedAt).getTime()) / 1000
      );
      this.activeJourney.durationSeconds = elapsed;
      this.notify();
    }, 1000);
  }

  private async startLocationWatch() {
    try {
      if (this.locationSub) {
        this.locationSub.remove();
        this.locationSub = null;
      }

      this.locationSub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 4000,
          distanceInterval: 10,
        },
        async (loc) => {
          if (!this.activeJourney || this.activeJourney.status !== 'ACTIVE') return;

          const point: JourneyPoint = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy || undefined,
            altitude: loc.coords.altitude || undefined,
            speed: loc.coords.speed || undefined,
            timestamp: new Date(loc.timestamp).toISOString(),
          };

          const pts = this.activeJourney.points;
          if (pts.length > 0) {
            const last = pts[pts.length - 1];
            const addedKm = calculateHaversineDistance(
              last.latitude,
              last.longitude,
              point.latitude,
              point.longitude
            );
            // Discard negligible drift jitter (< 8 meters)
            if (addedKm > 0.008) {
              this.activeJourney.distanceKm = parseFloat(
                (this.activeJourney.distanceKm + addedKm).toFixed(2)
              );
            }
          }

          this.activeJourney.points.push(point);
          await AsyncStorage.setItem(ACTIVE_JOURNEY_KEY, JSON.stringify(this.activeJourney));

          // Post live sharing coordinates to backend
          api.location.update({
            latitude: point.latitude,
            longitude: point.longitude,
            accuracy: point.accuracy,
            speed: point.speed,
            is_live_sharing: true,
          }).catch(() => {});

          this.notify();
        }
      );
    } catch (e) {
      console.warn('[SafeJourney] Location watch error:', e);
    }
  }

  public async endJourney(finalAddress?: string): Promise<JourneyRecord | null> {
    if (!this.activeJourney) return null;

    if (this.locationSub) {
      this.locationSub.remove();
      this.locationSub = null;
    }
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    const now = new Date();
    const completedJourney: JourneyRecord = {
      ...this.activeJourney,
      status: 'COMPLETED',
      endedAt: now.toISOString(),
      endAddress: finalAddress || 'Destination Reached',
      durationSeconds: Math.floor(
        (now.getTime() - new Date(this.activeJourney.startedAt).getTime()) / 1000
      ),
    };

    // Save to Journey History
    await this.saveToHistory(completedJourney);

    // Stop backend live sharing flag
    const lastPt = completedJourney.points[completedJourney.points.length - 1];
    if (lastPt) {
      api.location.update({
        latitude: lastPt.latitude,
        longitude: lastPt.longitude,
        accuracy: lastPt.accuracy,
        is_live_sharing: false,
      }).catch(() => {});
    }

    await AsyncStorage.removeItem(ACTIVE_JOURNEY_KEY);
    this.activeJourney = null;
    this.notify();
    return completedJourney;
  }

  public async getHistory(): Promise<JourneyRecord[]> {
    try {
      const raw = await AsyncStorage.getItem(JOURNEY_HISTORY_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  }

  private async saveToHistory(record: JourneyRecord): Promise<void> {
    try {
      const history = await this.getHistory();
      history.unshift(record);
      // Keep up to 25 recent journeys
      const trimmed = history.slice(0, 25);
      await AsyncStorage.setItem(JOURNEY_HISTORY_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.warn('[SafeJourney] Save history error:', e);
    }
  }

  public getActiveJourney(): JourneyRecord | null {
    return this.activeJourney;
  }
}

export const safeJourneyService = new SafeJourneyService();
