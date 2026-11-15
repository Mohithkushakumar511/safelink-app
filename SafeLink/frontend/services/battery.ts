import * as Battery from 'expo-battery';
import { Platform } from 'react-native';

export interface BatterySnapshot {
  level: number; // 0 - 100 percentage
  state: string; // 'CHARGING' | 'UNPLUGGED' | 'FULL' | 'UNKNOWN'
  isLowBattery: boolean;
  timestamp: string;
}

class BatteryMonitoringService {
  private listener: Battery.Subscription | null = null;
  private currentSnapshot: BatterySnapshot | null = null;

  public async getBatterySnapshot(): Promise<BatterySnapshot> {
    try {
      const isAvailable = await Battery.isAvailableAsync();
      if (!isAvailable) {
        return {
          level: 100,
          state: 'UNKNOWN',
          isLowBattery: false,
          timestamp: new Date().toISOString(),
        };
      }

      const rawLevel = await Battery.getBatteryLevelAsync();
      const batteryState = await Battery.getBatteryStateAsync();

      // rawLevel is between 0.0 and 1.0, or -1 if unknown
      let levelPercent = 100;
      if (rawLevel >= 0) {
        levelPercent = Math.round(rawLevel * 100);
      }

      let stateStr = 'UNPLUGGED';
      switch (batteryState) {
        case Battery.BatteryState.CHARGING:
          stateStr = 'CHARGING';
          break;
        case Battery.BatteryState.FULL:
          stateStr = 'FULL';
          break;
        case Battery.BatteryState.UNPLUGGED:
          stateStr = 'UNPLUGGED';
          break;
        default:
          stateStr = 'UNKNOWN';
          break;
      }

      const snapshot: BatterySnapshot = {
        level: levelPercent,
        state: stateStr,
        isLowBattery: levelPercent <= 20 && stateStr !== 'CHARGING',
        timestamp: new Date().toISOString(),
      };

      this.currentSnapshot = snapshot;
      return snapshot;
    } catch (e) {
      console.warn('[BatteryService] Battery query notice:', e);
      return {
        level: 100,
        state: 'UNKNOWN',
        isLowBattery: false,
        timestamp: new Date().toISOString(),
      };
    }
  }

  public getCachedSnapshot(): BatterySnapshot | null {
    return this.currentSnapshot;
  }

  public startListening(onChange: (snapshot: BatterySnapshot) => void): void {
    try {
      this.stopListening();
      this.listener = Battery.addBatteryLevelListener(async ({ batteryLevel }) => {
        const snap = await this.getBatterySnapshot();
        onChange(snap);
      });
    } catch (err) {
      console.warn('[BatteryService] Battery listener not supported:', err);
    }
  }

  public stopListening(): void {
    if (this.listener) {
      this.listener.remove();
      this.listener = null;
    }
  }
}

export const batteryService = new BatteryMonitoringService();
