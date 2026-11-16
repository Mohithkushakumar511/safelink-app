import Constants from 'expo-constants';
import { Platform } from 'react-native';

const CURRENT_LAN_IP = '192.168.91.232';
const SERVER_PORT = '8000';

// Dynamically extract the host IP of the machine running Metro bundler
const getMetroHostIp = (): string => {
  try {
    const hostUri =
      Constants.expoConfig?.hostUri ||
      (Constants as any).manifest2?.extra?.expoClient?.hostUri ||
      (Constants as any).manifest?.debuggerHost;
    if (hostUri && typeof hostUri === 'string') {
      const ip = hostUri.split(':')[0];
      if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
        return ip;
      }
    }
  } catch {}
  return CURRENT_LAN_IP;
};

export const DEFAULT_API_URL = `http://${getMetroHostIp()}:${SERVER_PORT}`;

const sanitizeApiUrl = (url?: string): string => {
  const activeIp = getMetroHostIp();
  if (!url || !url.trim()) {
    return `http://${activeIp}:${SERVER_PORT}`;
  }
  let clean = url.trim();
  // Ensure no trailing slashes
  while (clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }
  // Convert any local https scheme to http for local development
  if (
    clean.startsWith('https://localhost') ||
    clean.startsWith('https://127.0.0.1') ||
    clean.startsWith('https://10.0.2.2') ||
    clean.startsWith(`https://${activeIp}`) ||
    clean.startsWith('https://192.168.')
  ) {
    clean = clean.replace('https://', 'http://');
  }
  // On physical mobile devices, localhost or 127.0.0.1 is unreachable; rewrite to active LAN IP
  if (Platform.OS !== 'web') {
    if (clean.includes('localhost') || clean.includes('127.0.0.1')) {
      clean = clean.replace('localhost', activeIp).replace('127.0.0.1', activeIp);
    }
  }
  return clean;
};

export const AppConfig = {
  apiUrl: sanitizeApiUrl(process.env.EXPO_PUBLIC_API_URL),
  mapboxToken: process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || 'pk.eyJ1Ijoic2FmZWxpbmsiLCJhIjoiY200Y3pqbWNmMDA0azJ5a3NqY2Z2N2x2dyJ9.safelink_default',
  storageKeys: {
    token: 'safelink_jwt_token',
    user: 'safelink_cached_user',
    locationCache: 'safelink_latest_location',
    customMapboxToken: 'safelink_custom_mapbox_token'
  },
  emergency: {
    countdownSeconds: 5,
    defaultEmergencyNumber: '911',
  }
};
