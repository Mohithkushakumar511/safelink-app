import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { api } from './api';

const QUEUE_STORAGE_KEY = 'safelink_offline_sos_queue_v1';

export interface PendingLocationUpdate {
  id: string; // Unique deduplication ID
  incidentId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  address?: string;
  timestamp: string;
  batteryLevel?: number;
  attemptCount: number;
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
}

type SyncStatusListener = (pendingCount: number, isOnline: boolean) => void;

class OfflineQueueService {
  private queue: PendingLocationUpdate[] = [];
  private isOnline = true;
  private isSyncing = false;
  private listeners: Set<SyncStatusListener> = new Set();
  private unsubscribeNetInfo: (() => void) | null = null;

  constructor() {
    this.init();
  }

  public async init(): Promise<void> {
    await this.loadQueue();

    // Check initial network state
    const netState = await NetInfo.fetch();
    this.isOnline = !!(netState.isConnected && netState.isInternetReachable !== false);

    // Listen for connectivity changes
    this.unsubscribeNetInfo = NetInfo.addEventListener((state: NetInfoState) => {
      const previouslyOffline = !this.isOnline;
      this.isOnline = !!(state.isConnected && state.isInternetReachable !== false);

      this.notifyListeners();

      if (previouslyOffline && this.isOnline) {
        console.log('[OfflineQueue] Connection restored! Triggering automatic sync.');
        this.flushQueue();
      }
    });

    if (this.isOnline && this.queue.length > 0) {
      this.flushQueue();
    }
  }

  public getStatus(): { isOnline: boolean; pendingCount: number } {
    return {
      isOnline: this.isOnline,
      pendingCount: this.queue.filter((item) => item.status !== 'SYNCED').length,
    };
  }

  public subscribe(listener: SyncStatusListener): () => void {
    this.listeners.add(listener);
    const { isOnline, pendingCount } = this.getStatus();
    listener(pendingCount, isOnline);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const { isOnline, pendingCount } = this.getStatus();
    this.listeners.forEach((fn) => fn(pendingCount, isOnline));
  }

  private async loadQueue(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      if (raw) {
        this.queue = JSON.parse(raw);
      } else {
        this.queue = [];
      }
    } catch {
      this.queue = [];
    }
  }

  private async persistQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
    } catch (e) {
      console.warn('[OfflineQueue] Error persisting queue:', e);
    }
    this.notifyListeners();
  }

  /**
   * Enqueue a location update.
   * If online, attempts immediate dispatch.
   * If offline or failed, persists to local storage for automatic retry upon reconnection.
   */
  public async enqueueLocationUpdate(update: Omit<PendingLocationUpdate, 'id' | 'attemptCount' | 'status'>): Promise<boolean> {
    // Generate idempotent deduplication key based on incidentId + timestamp rounded to seconds
    const dedupeKey = `${update.incidentId}_${new Date(update.timestamp).getTime()}`;

    // Prevent duplicate entries
    const existing = this.queue.find((q) => q.id === dedupeKey);
    if (existing) {
      return false;
    }

    const item: PendingLocationUpdate = {
      ...update,
      id: dedupeKey,
      attemptCount: 0,
      status: 'PENDING',
    };

    this.queue.push(item);
    await this.persistQueue();

    if (this.isOnline) {
      this.flushQueue();
      return true;
    } else {
      console.log(`[OfflineQueue] Stored offline location update for incident ${update.incidentId}.`);
      return false;
    }
  }

  /**
   * Safely flushes pending items one-by-one.
   * Never deletes items before verified 200/201 HTTP success.
   */
  public async flushQueue(): Promise<void> {
    if (this.isSyncing || !this.isOnline) return;
    this.isSyncing = true;

    try {
      const pendingItems = this.queue.filter((i) => i.status !== 'SYNCED');
      for (const item of pendingItems) {
        if (!this.isOnline) break;

        item.status = 'SYNCING';
        item.attemptCount += 1;

        try {
          // Send location update to backend
          await api.sos.updateLocation(item.incidentId, {
            latitude: item.latitude,
            longitude: item.longitude,
            accuracy: item.accuracy,
            address: item.address,
          });

          // Successfully synchronized: Mark synced
          item.status = 'SYNCED';
          console.log(`[OfflineQueue] Synchronized update ${item.id} successfully.`);
        } catch (err: any) {
          console.warn(`[OfflineQueue] Sync failed for ${item.id}:`, err?.message);
          item.status = 'FAILED';
          // Check if error was network-related
          if (err?.code === 'ECONNABORTED' || !err?.response) {
            this.isOnline = false;
            break;
          }
        }
      }

      // Keep only recent unsynced items or items synced in the last hour
      const oneHourAgo = Date.now() - 3600000;
      this.queue = this.queue.filter((i) => {
        if (i.status !== 'SYNCED') return true;
        return new Date(i.timestamp).getTime() > oneHourAgo;
      });

      await this.persistQueue();
    } finally {
      this.isSyncing = false;
      this.notifyListeners();
    }
  }

  public cleanup(): void {
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
      this.unsubscribeNetInfo = null;
    }
  }
}

export const offlineQueueService = new OfflineQueueService();
