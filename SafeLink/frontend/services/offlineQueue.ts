import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { api } from './api';

const INCIDENTS_QUEUE_STORAGE_KEY = 'safelink_offline_sos_incidents_v2';
const QUEUE_STORAGE_KEY = 'safelink_offline_sos_queue_v1';
const TIMELINE_QUEUE_STORAGE_KEY = 'safelink_offline_timeline_queue_v1';
const SYNC_META_STORAGE_KEY = 'safelink_offline_sync_meta_v1';

// Exponential backoff intervals in milliseconds: 5s, 10s, 20s, 40s, max 60s
const BACKOFF_SCHEDULE_MS = [5000, 10000, 20000, 40000, 60000];

export interface PendingOfflineIncident {
  id: string; // e.g. OFFLINE-SOS-1700000000000
  user_id?: string;
  user_name?: string;
  user_phone?: string;
  activated_at: string; // Original activation timestamp
  latitude: number;
  longitude: number;
  accuracy?: number;
  address?: string;
  custom_note?: string;
  emergency_description?: string;
  sending_method?: string;
  voice_base64?: string;
  voice_duration_seconds?: number;
  countdown_seconds?: number;
  battery_level?: number;
  battery_status?: string;
  status: 'PENDING' | 'RETRYING' | 'SYNCED' | 'FAILED' | 'CANCELLED';
  attemptCount: number;
  lastAttemptAt?: string;
  nextRetryAt?: number;
  syncedIncidentId?: string; // Assigned backend incident_id once synced
  error?: string;
}

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
  nextRetryAt?: number;
}

export interface PendingTimelineEvent {
  id: string;
  incidentId: string;
  event: string;
  title: string;
  description: string;
  timestamp: string;
  status: 'Pending' | 'Attempted' | 'Sent' | 'Acknowledged' | 'Failed' | 'Escalated' | 'Resolved';
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  contact_id?: string;
  contact_name?: string;
  contact_phone?: string;
  escalation_level?: number;
  icon?: string;
  attemptCount: number;
  syncStatus: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
}

export interface QueueStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingIncidentsCount: number;
  pendingLocationsCount: number;
  pendingTimelineCount: number;
  totalPendingCount: number;
  lastSuccessfulSync?: string;
}

export type SyncStatusListener = (pendingCount: number, isOnline: boolean, status: QueueStatus) => void;

class OfflineQueueService {
  private offlineIncidents: PendingOfflineIncident[] = [];
  private locationQueue: PendingLocationUpdate[] = [];
  private timelineQueue: PendingTimelineEvent[] = [];
  private isOnline = true;
  private isSyncing = false;
  private lastSuccessfulSync?: string;
  private listeners: Set<SyncStatusListener> = new Set();
  private unsubscribeNetInfo: (() => void) | null = null;
  private retryTimer: any = null;

  constructor() {
    this.init();
  }

  public async init(): Promise<void> {
    await this.loadAllQueues();

    // Check initial network state
    try {
      const netState = await NetInfo.fetch();
      this.isOnline = !!(netState.isConnected && netState.isInternetReachable !== false);
    } catch {
      this.isOnline = false;
    }

    // Listen for connectivity changes
    this.unsubscribeNetInfo = NetInfo.addEventListener((state: NetInfoState) => {
      const previouslyOffline = !this.isOnline;
      this.isOnline = !!(state.isConnected && state.isInternetReachable !== false);

      this.notifyListeners();

      if (previouslyOffline && this.isOnline) {
        console.log('[OfflineQueue] Internet restored! Triggering immediate automatic sync flush.');
        // Reset nextRetryAt for immediate attempt
        const now = Date.now();
        this.offlineIncidents.forEach((item) => {
          if (item.status !== 'SYNCED' && item.status !== 'CANCELLED') item.nextRetryAt = now;
        });
        this.locationQueue.forEach((item) => {
          if (item.status !== 'SYNCED') item.nextRetryAt = now;
        });
        this.flushAll();
      }
    });

    // Start background backoff retry engine ticker (every 10 seconds)
    this.startRetryTicker();

    if (this.isOnline) {
      this.flushAll();
    }
  }

  private startRetryTicker(): void {
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.retryTimer = setInterval(() => {
      if (!this.isOnline || this.isSyncing) return;
      const now = Date.now();
      const hasDueIncidents = this.offlineIncidents.some(
        (i) => i.status !== 'SYNCED' && i.status !== 'CANCELLED' && (!i.nextRetryAt || now >= i.nextRetryAt)
      );
      const hasDueLocations = this.locationQueue.some(
        (l) => l.status !== 'SYNCED' && (!l.nextRetryAt || now >= l.nextRetryAt)
      );
      const hasDueTimeline = this.timelineQueue.some((t) => t.syncStatus !== 'SYNCED');

      if (hasDueIncidents || hasDueLocations || hasDueTimeline) {
        this.flushAll();
      }
    }, 10000);
  }

  public getStatus(): QueueStatus {
    const pendingIncidents = this.offlineIncidents.filter(
      (item) => item.status !== 'SYNCED' && item.status !== 'CANCELLED'
    ).length;
    const pendingLocations = this.locationQueue.filter((item) => item.status !== 'SYNCED').length;
    const pendingTimeline = this.timelineQueue.filter((item) => item.syncStatus !== 'SYNCED').length;

    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingIncidentsCount: pendingIncidents,
      pendingLocationsCount: pendingLocations,
      pendingTimelineCount: pendingTimeline,
      totalPendingCount: pendingIncidents + pendingLocations + pendingTimeline,
      lastSuccessfulSync: this.lastSuccessfulSync,
    };
  }

  public subscribe(listener: SyncStatusListener): () => void {
    this.listeners.add(listener);
    const s = this.getStatus();
    listener(s.totalPendingCount, s.isOnline, s);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const s = this.getStatus();
    this.listeners.forEach((fn) => {
      try {
        fn(s.totalPendingCount, s.isOnline, s);
      } catch (err) {
        console.warn('[OfflineQueue] Listener error:', err);
      }
    });
  }

  public async flushQueue(): Promise<void> {
    await this.flushAll();
  }

  // ---------------------------------------------------------------------------
  // Storage & Persistence
  // ---------------------------------------------------------------------------
  private async loadAllQueues(): Promise<void> {
    try {
      const [rawIncidents, rawLocations, rawTimeline, rawMeta] = await Promise.all([
        AsyncStorage.getItem(INCIDENTS_QUEUE_STORAGE_KEY),
        AsyncStorage.getItem(QUEUE_STORAGE_KEY),
        AsyncStorage.getItem(TIMELINE_QUEUE_STORAGE_KEY),
        AsyncStorage.getItem(SYNC_META_STORAGE_KEY),
      ]);

      this.offlineIncidents = rawIncidents ? JSON.parse(rawIncidents) : [];
      this.locationQueue = rawLocations ? JSON.parse(rawLocations) : [];
      this.timelineQueue = rawTimeline ? JSON.parse(rawTimeline) : [];
      if (rawMeta) {
        const meta = JSON.parse(rawMeta);
        this.lastSuccessfulSync = meta.lastSuccessfulSync;
      }
    } catch (err) {
      console.warn('[OfflineQueue] Error loading queues from AsyncStorage:', err);
    }
  }

  private async persistIncidentsQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(INCIDENTS_QUEUE_STORAGE_KEY, JSON.stringify(this.offlineIncidents));
    } catch (e) {
      console.warn('[OfflineQueue] Error persisting incidents queue:', e);
    }
    this.notifyListeners();
  }

  private async persistLocationQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.locationQueue));
    } catch (e) {
      console.warn('[OfflineQueue] Error persisting location queue:', e);
    }
    this.notifyListeners();
  }

  private async persistTimelineQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(TIMELINE_QUEUE_STORAGE_KEY, JSON.stringify(this.timelineQueue));
    } catch (e) {
      console.warn('[OfflineQueue] Error persisting timeline queue:', e);
    }
    this.notifyListeners();
  }

  private async recordSuccessfulSync(): Promise<void> {
    const iso = new Date().toISOString();
    this.lastSuccessfulSync = iso;
    try {
      await AsyncStorage.setItem(SYNC_META_STORAGE_KEY, JSON.stringify({ lastSuccessfulSync: iso }));
    } catch {}
    this.notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Offline SOS Incidents Queue
  // ---------------------------------------------------------------------------
  public async enqueueOfflineIncident(
    incident: Omit<PendingOfflineIncident, 'status' | 'attemptCount' | 'lastAttemptAt' | 'nextRetryAt'>
  ): Promise<PendingOfflineIncident> {
    const existing = this.offlineIncidents.find((i) => i.id === incident.id);
    if (existing) {
      return existing;
    }

    const item: PendingOfflineIncident = {
      ...incident,
      status: 'PENDING',
      attemptCount: 0,
      nextRetryAt: Date.now(),
    };

    this.offlineIncidents.push(item);
    await this.persistIncidentsQueue();

    // Also record timeline event for offline creation
    await this.enqueueTimelineEvent({
      id: `OFFLINE_TRIGGER_${item.id}`,
      incidentId: item.id,
      event: 'SOS_ACTIVATED_OFFLINE',
      title: 'SOS Activated in Offline Mode',
      description: 'Emergency initiated while device was offline. Saved locally and queued for synchronization.',
      timestamp: item.activated_at,
      status: 'Pending',
      latitude: item.latitude,
      longitude: item.longitude,
      accuracy: item.accuracy,
      icon: 'cloud-offline',
    });

    if (this.isOnline) {
      this.flushOfflineIncidents();
    }

    return item;
  }

  public getPendingIncident(id: string): PendingOfflineIncident | undefined {
    return this.offlineIncidents.find((i) => i.id === id || i.syncedIncidentId === id);
  }

  public async cancelOfflineIncident(id: string, reason?: string): Promise<void> {
    const item = this.offlineIncidents.find((i) => i.id === id || i.syncedIncidentId === id);
    if (item) {
      item.status = 'CANCELLED';
      await this.persistIncidentsQueue();
      await this.enqueueTimelineEvent({
        id: `CANCEL_${item.id}_${Date.now()}`,
        incidentId: item.syncedIncidentId || item.id,
        event: 'SOS_CANCELLED',
        title: 'Emergency SOS Cancelled',
        description: reason || 'Cancelled by user while synchronization was pending.',
        timestamp: new Date().toISOString(),
        status: 'Resolved',
        icon: 'checkmark-circle',
      });
    }
  }

  public async resolveOfflineIncident(id: string, note?: string): Promise<void> {
    const item = this.offlineIncidents.find((i) => i.id === id || i.syncedIncidentId === id);
    if (item) {
      item.status = 'SYNCED';
      await this.persistIncidentsQueue();
      await this.enqueueTimelineEvent({
        id: `RESOLVE_${item.id}_${Date.now()}`,
        incidentId: item.syncedIncidentId || item.id,
        event: 'SOS_RESOLVED',
        title: 'Emergency Incident Resolved',
        description: note || 'Situation safely resolved by user.',
        timestamp: new Date().toISOString(),
        status: 'Resolved',
        icon: 'checkmark-circle',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Location Updates Queue
  // ---------------------------------------------------------------------------
  public async enqueueLocationUpdate(
    update: Omit<PendingLocationUpdate, 'id' | 'attemptCount' | 'status' | 'nextRetryAt'>
  ): Promise<boolean> {
    const dedupeKey = `${update.incidentId}_${new Date(update.timestamp).getTime()}`;
    const existing = this.locationQueue.find((q) => q.id === dedupeKey);
    if (existing) return false;

    const item: PendingLocationUpdate = {
      ...update,
      id: dedupeKey,
      attemptCount: 0,
      status: 'PENDING',
      nextRetryAt: Date.now(),
    };

    this.locationQueue.push(item);
    await this.persistLocationQueue();

    if (this.isOnline) {
      this.flushLocationQueue();
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Timeline Events Queue
  // ---------------------------------------------------------------------------
  public async enqueueTimelineEvent(
    event: Omit<PendingTimelineEvent, 'attemptCount' | 'syncStatus'>
  ): Promise<boolean> {
    const existing = this.timelineQueue.find((q) => q.id === event.id);
    if (existing) return false;

    const item: PendingTimelineEvent = {
      ...event,
      attemptCount: 0,
      syncStatus: 'PENDING',
    };

    this.timelineQueue.push(item);
    await this.persistTimelineQueue();

    if (this.isOnline) {
      this.flushTimelineQueue();
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Smart Flush & Retry Engine (Exponential Backoff)
  // ---------------------------------------------------------------------------
  public async flushAll(): Promise<void> {
    if (this.isSyncing || !this.isOnline) return;
    this.isSyncing = true;
    this.notifyListeners();

    try {
      // 1. First sync pending offline incidents to establish cloud incident IDs
      await this.flushOfflineIncidents();
      // 2. Sync pending location updates
      await this.flushLocationQueue();
      // 3. Sync pending timeline events
      await this.flushTimelineQueue();
    } finally {
      this.isSyncing = false;
      this.notifyListeners();
    }
  }

  public async flushOfflineIncidents(): Promise<void> {
    const now = Date.now();
    const pending = this.offlineIncidents.filter(
      (i) => i.status !== 'SYNCED' && i.status !== 'CANCELLED' && (!i.nextRetryAt || now >= i.nextRetryAt)
    );
    if (pending.length === 0) return;

    for (const incident of pending) {
      if (!this.isOnline) break;

      incident.status = 'RETRYING';
      incident.attemptCount += 1;
      incident.lastAttemptAt = new Date().toISOString();

      try {
        console.log(`[OfflineQueue] Synchronizing offline incident ${incident.id} (Attempt #${incident.attemptCount})...`);

        const created = await api.sos.create({
          latitude: incident.latitude,
          longitude: incident.longitude,
          accuracy: incident.accuracy,
          address: incident.address,
          custom_note: incident.custom_note,
          emergency_description: incident.emergency_description,
          sending_method: incident.sending_method || 'SMS',
          voice_base64: incident.voice_base64,
          voice_duration_seconds: incident.voice_duration_seconds,
          countdown_seconds: incident.countdown_seconds,
          battery_level: incident.battery_level,
          battery_status: incident.battery_status,
          offline_incident_id: incident.id,
          activated_at: incident.activated_at,
          created_offline: true,
          retry_count: incident.attemptCount,
        });

        const syncedCode = created.incident_id || created.id;
        incident.syncedIncidentId = syncedCode;
        incident.status = 'SYNCED';
        incident.error = undefined;
        console.log(`[OfflineQueue] Successfully synchronized offline incident ${incident.id} -> Cloud #${syncedCode}`);

        // Update any queued locations or timeline items mapped to this offline ID
        this.locationQueue.forEach((loc) => {
          if (loc.incidentId === incident.id) loc.incidentId = syncedCode;
        });
        this.timelineQueue.forEach((evt) => {
          if (evt.incidentId === incident.id) evt.incidentId = syncedCode;
        });

        // Record successful retry timeline entry
        await this.enqueueTimelineEvent({
          id: `RETRY_SUCCESS_${incident.id}_${incident.attemptCount}`,
          incidentId: syncedCode,
          event: 'SOS_SYNC_RESTORED',
          title: `Cloud Sync Succeeded (Attempt #${incident.attemptCount})`,
          description: `Emergency incident synced to SafeLink Cloud. Active live tracking operational.`,
          timestamp: new Date().toISOString(),
          status: 'Sent',
          icon: 'cloud-done',
        });

        await this.recordSuccessfulSync();
      } catch (err: any) {
        console.warn(`[OfflineQueue] Sync failed for offline incident ${incident.id}:`, err?.message);
        incident.status = 'FAILED';
        incident.error = err?.message || 'Network error';

        // Calculate exponential backoff interval
        const backoffIdx = Math.min(incident.attemptCount - 1, BACKOFF_SCHEDULE_MS.length - 1);
        const backoffMs = BACKOFF_SCHEDULE_MS[backoffIdx];
        incident.nextRetryAt = Date.now() + backoffMs;

        // Record retry attempt failure in timeline
        await this.enqueueTimelineEvent({
          id: `RETRY_FAIL_${incident.id}_${incident.attemptCount}`,
          incidentId: incident.syncedIncidentId || incident.id,
          event: 'SOS_RETRY_ATTEMPT',
          title: `Cloud Sync Attempt #${incident.attemptCount} Failed`,
          description: `Backend unavailable. Next retry scheduled in ${Math.round(backoffMs / 1000)}s.`,
          timestamp: new Date().toISOString(),
          status: 'Attempted',
          icon: 'alert-circle',
        });

        if (err?.code === 'ECONNABORTED' || !err?.response) {
          this.isOnline = false;
          break;
        }
      }
    }

    // Keep synced incidents in queue for 2 hours for audit history
    const twoHoursAgo = Date.now() - 7200000;
    this.offlineIncidents = this.offlineIncidents.filter((i) => {
      if (i.status !== 'SYNCED' && i.status !== 'CANCELLED') return true;
      return new Date(i.activated_at).getTime() > twoHoursAgo;
    });

    await this.persistIncidentsQueue();
  }

  public async flushLocationQueue(): Promise<void> {
    const now = Date.now();
    const pending = this.locationQueue.filter(
      (i) => i.status !== 'SYNCED' && (!i.nextRetryAt || now >= i.nextRetryAt)
    );
    if (pending.length === 0) return;

    for (const item of pending) {
      if (!this.isOnline) break;

      item.status = 'SYNCING';
      item.attemptCount += 1;

      try {
        await api.sos.updateLocation(item.incidentId, {
          latitude: item.latitude,
          longitude: item.longitude,
          accuracy: item.accuracy,
          address: item.address,
        });

        item.status = 'SYNCED';
        await this.recordSuccessfulSync();
      } catch (err: any) {
        console.warn(`[OfflineQueue] Location update sync failed for ${item.id}:`, err?.message);
        item.status = 'FAILED';

        const backoffIdx = Math.min(item.attemptCount - 1, BACKOFF_SCHEDULE_MS.length - 1);
        item.nextRetryAt = Date.now() + BACKOFF_SCHEDULE_MS[backoffIdx];

        if (err?.code === 'ECONNABORTED' || !err?.response) {
          this.isOnline = false;
          break;
        }
      }
    }

    const oneHourAgo = Date.now() - 3600000;
    this.locationQueue = this.locationQueue.filter((i) => {
      if (i.status !== 'SYNCED') return true;
      return new Date(i.timestamp).getTime() > oneHourAgo;
    });

    await this.persistLocationQueue();
  }

  public async flushTimelineQueue(): Promise<void> {
    const pending = this.timelineQueue.filter((i) => i.syncStatus !== 'SYNCED');
    if (pending.length === 0) return;

    // Group by incidentId
    const byIncident: Record<string, PendingTimelineEvent[]> = {};
    for (const item of pending) {
      if (!byIncident[item.incidentId]) byIncident[item.incidentId] = [];
      byIncident[item.incidentId].push(item);
    }

    for (const [incId, events] of Object.entries(byIncident)) {
      if (!this.isOnline) break;
      try {
        const payload = events.map((e) => ({
          id: e.id,
          incident_id: incId,
          event: e.event,
          title: e.title,
          description: e.description,
          timestamp: e.timestamp,
          status: e.status,
          latitude: e.latitude,
          longitude: e.longitude,
          accuracy: e.accuracy,
          contact_id: e.contact_id,
          contact_name: e.contact_name,
          contact_phone: e.contact_phone,
          escalation_level: e.escalation_level,
          icon: e.icon,
        }));

        await api.sos.syncTimeline(incId, payload);

        events.forEach((ev) => {
          ev.syncStatus = 'SYNCED';
        });
        await this.recordSuccessfulSync();
      } catch (err: any) {
        console.warn(`[OfflineQueue] Timeline sync failed for incident ${incId}:`, err?.message);
        events.forEach((ev) => {
          ev.syncStatus = 'FAILED';
          ev.attemptCount += 1;
        });
        if (err?.code === 'ECONNABORTED' || !err?.response) {
          this.isOnline = false;
          break;
        }
      }
    }

    const oneHourAgo = Date.now() - 3600000;
    this.timelineQueue = this.timelineQueue.filter((i) => {
      if (i.syncStatus !== 'SYNCED') return true;
      return new Date(i.timestamp).getTime() > oneHourAgo;
    });

    await this.persistTimelineQueue();
  }

  public cleanup(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
      this.unsubscribeNetInfo = null;
    }
  }
}

export const offlineQueueService = new OfflineQueueService();
