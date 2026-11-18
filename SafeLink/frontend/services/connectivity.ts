import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { api } from './api';
import { LocationService, GpsStatus, GpsAccuracyQuality, LocationData } from './location';
import { offlineQueueService } from './offlineQueue';

export type NetworkType = 'wifi' | 'cellular' | 'none' | 'unknown';
export type BackendStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'CHECKING';

export interface ConnectivityState {
  // Internet Connectivity
  isConnected: boolean;
  isInternetReachable: boolean | null;
  networkType: NetworkType;
  networkName?: string; // Carrier or SSID if available
  cellularGeneration?: string | null;
  ipAddress?: string | null;

  // Backend Availability
  backendStatus: BackendStatus;
  backendLatencyMs?: number;
  lastBackendPing?: string;

  // GPS Intelligence
  gpsAvailable: boolean;
  gpsPermission: boolean;
  gpsQuality: GpsAccuracyQuality;
  gpsAccuracyMeters?: number | null;
  isGpsStale: boolean;
  lastGpsFix?: LocationData | null;
  gpsErrorMessage?: string;

  // Offline SOS & Sync Engine
  pendingIncidentsCount: number;
  pendingLocationsCount: number;
  totalPendingCount: number;
  isSyncing: boolean;
  lastSuccessfulSync?: string;

  // Composite Readiness
  overallStatus: 'OPTIMAL' | 'DEGRADED' | 'OFFLINE_SMS_READY';
  recommendedMethod: 'DIRECT_API_AND_SMS' | 'OFFLINE_SMS_QUEUE' | 'STANDBY';
}

type ConnectivityListener = (state: ConnectivityState) => void;

class ConnectivityIntelligenceService {
  private currentState: ConnectivityState = {
    isConnected: true,
    isInternetReachable: true,
    networkType: 'unknown',
    backendStatus: 'CHECKING',
    gpsAvailable: true,
    gpsPermission: true,
    gpsQuality: 'UNAVAILABLE',
    isGpsStale: false,
    pendingIncidentsCount: 0,
    pendingLocationsCount: 0,
    totalPendingCount: 0,
    isSyncing: false,
    overallStatus: 'OPTIMAL',
    recommendedMethod: 'DIRECT_API_AND_SMS',
  };

  private listeners: Set<ConnectivityListener> = new Set();
  private unsubscribeNetInfo: (() => void) | null = null;
  private unsubscribeQueue: (() => void) | null = null;
  private pingInterval: any = null;
  private gpsInterval: any = null;

  constructor() {
    this.init();
  }

  public async init(): Promise<void> {
    // 1. Initial network state
    try {
      const net = await NetInfo.fetch();
      this.updateNetworkState(net);
    } catch {
      this.currentState.isConnected = false;
      this.currentState.networkType = 'none';
    }

    // 2. Listen to network changes
    this.unsubscribeNetInfo = NetInfo.addEventListener((netState: NetInfoState) => {
      this.updateNetworkState(netState);
      this.checkBackend();
      this.refreshGps();
    });

    // 3. Listen to offline queue updates
    this.unsubscribeQueue = offlineQueueService.subscribe((_count, _online, qStatus) => {
      this.currentState.pendingIncidentsCount = qStatus.pendingIncidentsCount;
      this.currentState.pendingLocationsCount = qStatus.pendingLocationsCount;
      this.currentState.totalPendingCount = qStatus.totalPendingCount;
      this.currentState.isSyncing = qStatus.isSyncing;
      this.currentState.lastSuccessfulSync = qStatus.lastSuccessfulSync;
      this.recomputeOverallStatus();
      this.notify();
    });

    // 4. Initial Backend Ping & GPS check
    await this.checkBackend();
    await this.refreshGps();

    // 5. Periodic background heartbeat (every 25 seconds)
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.currentState.isConnected) {
        this.checkBackend();
      }
    }, 25000);

    // 6. Periodic GPS status check (every 45 seconds)
    if (this.gpsInterval) clearInterval(this.gpsInterval);
    this.gpsInterval = setInterval(() => {
      this.refreshGps();
    }, 45000);
  }

  private updateNetworkState(net: NetInfoState): void {
    this.currentState.isConnected = !!net.isConnected;
    this.currentState.isInternetReachable = net.isInternetReachable;

    let netType: NetworkType = 'unknown';
    if (!net.isConnected) {
      netType = 'none';
    } else if (net.type === 'wifi') {
      netType = 'wifi';
    } else if (net.type === 'cellular') {
      netType = 'cellular';
    } else {
      netType = 'unknown';
    }
    this.currentState.networkType = netType;

    if (net.details) {
      const d: any = net.details;
      this.currentState.cellularGeneration = d.cellularGeneration || null;
      this.currentState.ipAddress = d.ipAddress || null;
      this.currentState.networkName = d.carrier || (netType === 'wifi' ? 'Wi-Fi Network' : undefined);
    }

    if (!net.isConnected) {
      this.currentState.backendStatus = 'UNAVAILABLE';
    }

    this.recomputeOverallStatus();
    this.notify();
  }

  public async checkBackend(): Promise<BackendStatus> {
    if (!this.currentState.isConnected) {
      this.currentState.backendStatus = 'UNAVAILABLE';
      this.recomputeOverallStatus();
      this.notify();
      return 'UNAVAILABLE';
    }

    this.currentState.backendStatus = 'CHECKING';
    this.notify();

    try {
      const res = await api.health.ping(3500);
      if (res.ok) {
        this.currentState.backendStatus = 'AVAILABLE';
        this.currentState.backendLatencyMs = res.latencyMs;
        this.currentState.lastBackendPing = new Date().toISOString();
      } else {
        this.currentState.backendStatus = 'UNAVAILABLE';
      }
    } catch {
      this.currentState.backendStatus = 'UNAVAILABLE';
    }

    this.recomputeOverallStatus();
    this.notify();
    return this.currentState.backendStatus;
  }

  public async refreshGps(): Promise<GpsStatus> {
    const gps = await LocationService.checkGpsStatus();
    this.currentState.gpsAvailable = gps.isAvailable;
    this.currentState.gpsPermission = gps.hasPermission;
    this.currentState.gpsQuality = gps.accuracyQuality;
    this.currentState.gpsAccuracyMeters = gps.accuracyMeters;
    this.currentState.isGpsStale = gps.isStale;
    this.currentState.lastGpsFix = gps.lastKnownLocation;
    this.currentState.gpsErrorMessage = gps.errorMessage;

    this.recomputeOverallStatus();
    this.notify();
    return gps;
  }

  private recomputeOverallStatus(): void {
    const isOnline = this.currentState.isConnected && this.currentState.backendStatus === 'AVAILABLE';
    const gpsGood = this.currentState.gpsAvailable && this.currentState.gpsPermission;

    if (isOnline && gpsGood && this.currentState.gpsQuality === 'HIGH') {
      this.currentState.overallStatus = 'OPTIMAL';
      this.currentState.recommendedMethod = 'DIRECT_API_AND_SMS';
    } else if (isOnline) {
      this.currentState.overallStatus = 'DEGRADED';
      this.currentState.recommendedMethod = 'DIRECT_API_AND_SMS';
    } else {
      this.currentState.overallStatus = 'OFFLINE_SMS_READY';
      this.currentState.recommendedMethod = 'OFFLINE_SMS_QUEUE';
    }
  }

  public async forceCheck(): Promise<ConnectivityState> {
    try {
      const net = await NetInfo.fetch();
      this.updateNetworkState(net);
    } catch {}
    await Promise.all([this.checkBackend(), this.refreshGps()]);
    if (this.currentState.isConnected && this.currentState.backendStatus === 'AVAILABLE') {
      offlineQueueService.flushAll().catch(() => {});
    }
    return this.currentState;
  }

  public getState(): ConnectivityState {
    return { ...this.currentState };
  }

  public subscribe(listener: ConnectivityListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const state = this.getState();
    this.listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (err) {
        console.warn('[ConnectivityService] Listener notify error:', err);
      }
    });
  }

  public cleanup(): void {
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
      this.unsubscribeNetInfo = null;
    }
    if (this.unsubscribeQueue) {
      this.unsubscribeQueue();
      this.unsubscribeQueue = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.gpsInterval) {
      clearInterval(this.gpsInterval);
      this.gpsInterval = null;
    }
  }
}

export const connectivityService = new ConnectivityIntelligenceService();
