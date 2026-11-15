import { Platform, PermissionsAndroid, Alert, NativeModules } from 'react-native';
import { SosDispatchService } from './sos';

export interface SmsDispatchResult {
  status: 'PENDING' | 'SUBMITTED' | 'SENT' | 'FAILED';
  method: 'DIRECT_NATIVE_SMS' | 'SMS_CLIENT_FALLBACK';
  details: string;
  deliveryConfirmation: string;
  timestamp: string;
}

export const DirectSmsService = {
  /**
   * Check if direct SEND_SMS permission is granted on Android.
   */
  async checkPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      const granted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.SEND_SMS
      );
      return granted;
    } catch (err) {
      console.warn('[DirectSmsService] Permission check error:', err);
      return false;
    }
  },

  /**
   * Explicitly request SEND_SMS permission on Android (run during setup/settings, not repeatedly in panic).
   */
  async requestPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.SEND_SMS,
        {
          title: 'Direct Emergency SMS Permission',
          message:
            'SafeLink requires cellular SMS permission to automatically transmit your live coordinates and distress alerts to your emergency contact during an SOS without requiring manual app switching.',
          buttonPositive: 'Grant Permission',
          buttonNegative: 'Use Composer Fallback',
        }
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn('[DirectSmsService] Permission request failed:', err);
      return false;
    }
  },

  /**
   * Send the emergency SMS directly if possible, or fall back to native SMS client with prefilled data.
   */
  async sendEmergencySms(
    phoneNumber: string,
    message: string
  ): Promise<SmsDispatchResult> {
    const nowIso = new Date().toISOString();
    const cleanPhone = phoneNumber.replace(/[^\d+]/g, '');

    // 1. On Android, check if direct SMS permission is granted
    if (Platform.OS === 'android') {
      try {
        const hasPermission = await this.checkPermission();

        // Check if a direct native SMS module is injected in this runtime
        const NativeDirectSms =
          NativeModules?.DirectSms ||
          NativeModules?.Sms ||
          (globalThis as any)?.NativeModules?.DirectSms;

        if (hasPermission && NativeDirectSms?.sendDirectSms) {
          try {
            await NativeDirectSms.sendDirectSms(cleanPhone, message);
            return {
              status: 'SENT',
              method: 'DIRECT_NATIVE_SMS',
              details: `Transmitted directly via Android SmsManager to ${cleanPhone}.`,
              deliveryConfirmation:
                'Submitted to Cellular Base Station (Pending Carrier Receipt)',
              timestamp: nowIso,
            };
          } catch (directErr: any) {
            console.warn('[DirectSmsService] Native direct SMS send failed, falling back:', directErr);
          }
        }
      } catch (checkErr) {
        console.warn('[DirectSmsService] Direct check failed:', checkErr);
      }
    }

    // 2. Seamless Fallback: Invoke native SMS composer prefilled with message
    try {
      const opened = await SosDispatchService.openNativeSMS(cleanPhone, message);
      if (opened) {
        return {
          status: 'SUBMITTED',
          method: 'SMS_CLIENT_FALLBACK',
          details: `Invoked native SMS client with pre-filled distress coordinates for ${cleanPhone}.`,
          deliveryConfirmation:
            'SUBMITTED via Device Messaging Client (Unconfirmed Carrier Transmission)',
          timestamp: nowIso,
        };
      }
      return {
        status: 'FAILED',
        method: 'SMS_CLIENT_FALLBACK',
        details: 'Unable to open native SMS client on device.',
        deliveryConfirmation: 'NOT_AVAILABLE',
        timestamp: nowIso,
      };
    } catch (fallbackErr: any) {
      return {
        status: 'FAILED',
        method: 'SMS_CLIENT_FALLBACK',
        details: fallbackErr?.message || 'Emergency SMS dispatch failed.',
        deliveryConfirmation: 'FAILED',
        timestamp: nowIso,
      };
    }
  },
};
