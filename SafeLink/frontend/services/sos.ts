import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { AppConfig } from '@/constants/config';

export const SosDispatchService = {
  buildEmergencyMessage(
    name: string,
    incidentId: string,
    activationTime: string,
    locationUrl?: string,
    isLastKnown = false,
    emergencyDescription?: string,
    isUnavailable = false
  ): string {
    const locLine = isUnavailable || !locationUrl
      ? `Location: Location unavailable (Device GPS disabled or unavailable)`
      : isLastKnown
      ? `Location (Last Known Fix): ${locationUrl}`
      : `Location: ${locationUrl}`;

    const ackUrl = `${AppConfig.apiUrl}/sos/ack/${incidentId}`;

    let msg =
      `EMERGENCY SOS ALERT!\n\n` +
      `I need emergency assistance.\n\n` +
      `Name: ${name}\n` +
      `Incident ID: ${incidentId}\n` +
      `Time: ${activationTime}\n`;

    if (emergencyDescription && emergencyDescription.trim()) {
      msg += `Description: ${emergencyDescription.trim()}\n`;
    }

    msg +=
      `${locLine}\n\n` +
      `Respond / Acknowledge: ${ackUrl}\n\n` +
      `Please contact me immediately.`;

    return msg;
  },

  buildResolutionMessage(name: string, incidentId: string, resolutionNote?: string): string {
    return (
      `SAFEGUARD UPDATE - RESOLVED\n\n` +
      `The emergency incident has been resolved safely.\n\n` +
      `Name: ${name}\n` +
      `Incident ID: ${incidentId}\n` +
      `Status: RESOLVED\n` +
      `Note: ${resolutionNote || 'Situation safely resolved'}\n\n` +
      `Thank you for your assistance.`
    );
  },

  buildCancellationMessage(name: string, incidentId: string, reason?: string): string {
    return (
      `SAFEGUARD UPDATE - CANCELLED\n\n` +
      `The emergency SOS alert has been cancelled.\n\n` +
      `Name: ${name}\n` +
      `Incident ID: ${incidentId}\n` +
      `Status: CANCELLED\n` +
      `Reason: ${reason || 'False alarm / Accidental activation'}\n\n` +
      `I am safe and secure.`
    );
  },

  async openNativeSMS(phoneNumber: string, message: string): Promise<boolean> {
    const cleanPhone = phoneNumber.replace(/[^\d+]/g, '');
    const encodedBody = encodeURIComponent(message);
    const separator = Platform.OS === 'ios' ? '&' : '?';
    const smsUrl = `sms:${cleanPhone}${separator}body=${encodedBody}`;

    try {
      // Try opening directly with sms:phone?body=...
      // Note: On Android 11+, canOpenURL often returns false due to package visibility,
      // so we call openURL directly in a try/catch.
      await Linking.openURL(smsUrl);
      return true;
    } catch (e) {
      console.warn('[SosDispatchService] Formatted SMS open notice, attempting plain sms intent:', e);
      try {
        await Linking.openURL(`sms:${cleanPhone}`);
        return true;
      } catch (err2) {
        console.warn('[SosDispatchService] SMS app launch failed:', err2);
        return false;
      }
    }
  },

  async openWhatsApp(phoneNumber: string, message: string): Promise<boolean> {
    const cleanPhone = phoneNumber.replace(/[^\d]/g, '');
    const encodedText = encodeURIComponent(message);
    const appUrl = `whatsapp://send?phone=${cleanPhone}&text=${encodedText}`;
    const webFallbackUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;

    try {
      const canOpen = await Linking.canOpenURL(appUrl);
      if (canOpen) {
        await Linking.openURL(appUrl);
        return true;
      }
      await Linking.openURL(webFallbackUrl);
      return true;
    } catch (e) {
      console.warn('[SosDispatchService] WhatsApp launch notice:', e);
      try {
        await Linking.openURL(webFallbackUrl);
        return true;
      } catch {
        return false;
      }
    }
  },
};
