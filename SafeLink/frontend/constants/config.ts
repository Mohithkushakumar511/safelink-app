import { Platform } from 'react-native';

const LAN_SERVER_IP = '192.168.1.6';
const SERVER_PORT = '8000';
export const DEFAULT_API_URL = `http://${LAN_SERVER_IP}:${SERVER_PORT}`;

const sanitizeApiUrl = (url?: string): string => {
  if (!url || !url.trim()) {
    return DEFAULT_API_URL;
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
    clean.startsWith(`https://${LAN_SERVER_IP}`) ||
    clean.startsWith('https://192.168.')
  ) {
    clean = clean.replace('https://', 'http://');
  }
  // On physical mobile devices, localhost or 127.0.0.1 is unreachable; rewrite to LAN IP
  if (Platform.OS !== 'web') {
    if (clean.includes('localhost') || clean.includes('127.0.0.1')) {
      clean = clean.replace('localhost', LAN_SERVER_IP).replace('127.0.0.1', LAN_SERVER_IP);
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
