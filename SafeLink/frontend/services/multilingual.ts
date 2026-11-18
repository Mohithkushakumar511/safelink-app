import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppConfig } from '@/constants/config';

export type EmergencyLanguage = 'en' | 'kn' | 'hi';

export interface EmergencyMessageParams {
  name: string;
  incidentId: string;
  activationTime: string;
  locationUrl?: string;
  isUnavailable?: boolean;
  description?: string;
}

export const SUPPORTED_LANGUAGES: { code: EmergencyLanguage; name: string; nativeName: string }[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
];

const STORAGE_KEY = 'safelink_emergency_lang';

export const MultilingualService = {
  async getSelectedLanguage(): Promise<EmergencyLanguage> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored === 'kn' || stored === 'hi' || stored === 'en') {
        return stored;
      }
    } catch {}
    return 'en';
  },

  async setSelectedLanguage(lang: EmergencyLanguage): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      console.warn('[MultilingualService] Save language failed:', e);
    }
  },

  buildMessage(params: EmergencyMessageParams, lang: EmergencyLanguage = 'en'): string {
    const { name, incidentId, activationTime, locationUrl, isUnavailable, description } = params;
    const ackUrl = `${AppConfig.apiUrl}/sos/ack/${incidentId}`;

    if (lang === 'kn') {
      const locText = isUnavailable || !locationUrl
        ? 'ಸ್ಥಳ (Location): ಲಭ್ಯವಿಲ್ಲ (ಜಿಪಿಎಸ್ ಆಫ್ ಆಗಿದೆ / Location unavailable)'
        : `ಸ್ಥಳ (Location): ${locationUrl}`;

      let msg =
        `ತುರ್ತು SOS ಎಚ್ಚರಿಕೆ! (EMERGENCY SOS ALERT!)\n\n` +
        `ನನಗೆ ತಕ್ಷಣದ ತುರ್ತು ನೆರವು ಬೇಕಾಗಿದೆ. (I need emergency assistance.)\n\n` +
        `ಹೆಸರು (Name): ${name}\n` +
        `ಘಟನೆಯ ಐಡಿ (Incident ID): ${incidentId}\n` +
        `ಸಮಯ (Time): ${activationTime}\n`;

      if (description && description.trim()) {
        msg += `ವಿವರಣೆ (Description): ${description.trim()}\n`;
      }

      msg +=
        `${locText}\n\n` +
        `ಪ್ರತಿಕ್ರಿಯಿಸಿ / ಸ್ವೀಕರಿಸಿ (Acknowledge): ${ackUrl}\n\n` +
        `ದಯವಿಟ್ಟು ತಕ್ಷಣ ನನ್ನನ್ನು ಸಂಪರ್ಕಿಸಿ. (Please contact me immediately.)`;

      return msg;
    }

    if (lang === 'hi') {
      const locText = isUnavailable || !locationUrl
        ? 'स्थान (Location): अनुपलब्ध (जीपीएस बंद है / Location unavailable)'
        : `स्थान (Location): ${locationUrl}`;

      let msg =
        `आपातकालीन SOS चेतावनी! (EMERGENCY SOS ALERT!)\n\n` +
        `मुझे तत्काल आपातकालीन सहायता की आवश्यकता है। (I need emergency assistance.)\n\n` +
        `नाम (Name): ${name}\n` +
        `घटना आईडी (Incident ID): ${incidentId}\n` +
        `समय (Time): ${activationTime}\n`;

      if (description && description.trim()) {
        msg += `विवरण (Description): ${description.trim()}\n`;
      }

      msg +=
        `${locText}\n\n` +
        `प्रतिक्रिया दें / स्वीकार करें (Acknowledge): ${ackUrl}\n\n` +
        `कृपया तुरंत मुझसे संपर्क करें। (Please contact me immediately.)`;

      return msg;
    }

    // Default English fallback
    const locText = isUnavailable || !locationUrl
      ? 'Location: Location unavailable (Device GPS disabled or unavailable)'
      : `Location: ${locationUrl}`;

    let msg =
      `EMERGENCY SOS ALERT!\n\n` +
      `I need emergency assistance.\n\n` +
      `Name: ${name}\n` +
      `Incident ID: ${incidentId}\n` +
      `Time: ${activationTime}\n`;

    if (description && description.trim()) {
      msg += `Description: ${description.trim()}\n`;
    }

    msg +=
      `${locText}\n\n` +
      `Respond / Acknowledge: ${ackUrl}\n\n` +
      `Please contact me immediately.`;

    return msg;
  },
};
