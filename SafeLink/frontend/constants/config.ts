import Constants from 'expo-constants';

const CURRENT_LAN_IP = '192.168.1.6';
const SERVER_PORT = '8001';

// Exclude known virtual machine, tunnel, and link-local subnets (VMware, VirtualBox, WSL, APIPA)
const isVirtualOrInvalidIp = (ip?: string): boolean => {
  if (!ip) return true;
  return (
    ip === 'localhost' ||
    ip === '127.0.0.1' ||
    ip === '10.0.2.2' ||
    ip.startsWith('192.168.189.') || // VMware VMnet1
    ip.startsWith('192.168.79.') ||  // VMware VMnet8
    ip.startsWith('192.168.56.') ||  // VirtualBox Host-Only
    ip.startsWith('169.254.')        // Link-local / APIPA
  );
};

// Dynamically extract the host IP of the machine running Metro bundler
const getMetroHostIp = (): string => {
  try {
    const hostUri =
      Constants.expoConfig?.hostUri ||
      (Constants as any).manifest2?.extra?.expoClient?.hostUri ||
      (Constants as any).manifest?.debuggerHost;
    if (hostUri && typeof hostUri === 'string') {
      const host = hostUri.split(':')[0];
      // Only accept if it's a valid IPv4 address and NOT a virtual/tunnel adapter
      if (
        host &&
        /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) &&
        !isVirtualOrInvalidIp(host)
      ) {
        return host;
      }
    }
  } catch {}
  return CURRENT_LAN_IP;
};

export const DEFAULT_API_URL = `http://${getMetroHostIp()}:${SERVER_PORT}`;

const sanitizeApiUrl = (url?: string): string => {
  const activeIp = getMetroHostIp();

  // If a production cloud domain (https) is explicitly provided, preserve it
  if (url && url.startsWith('https://')) {
    let clean = url.trim();
    while (clean.endsWith('/')) clean = clean.slice(0, -1);
    return clean;
  }

  // In local development on device, ALWAYS dynamically target the active Metro host IP on port 8001
  // This ensures changing Wi-Fi networks (home, college, mobile hotspot) never breaks the connection
  if (activeIp && !isVirtualOrInvalidIp(activeIp)) {
    return `http://${activeIp}:${SERVER_PORT}`;
  }

  if (!url || !url.trim()) {
    return `http://${activeIp}:${SERVER_PORT}`;
  }

  let clean = url.trim();
  while (clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }

  // Replace localhost or emulator addresses with the active LAN IP
  clean = clean.replace('localhost', activeIp).replace('127.0.0.1', activeIp).replace('10.0.2.2', activeIp);

  // If clean points to a virtual VMware/VirtualBox/APIPA IP, rewrite it to activeIp
  const hostPart = clean.replace(/^https?:\/\//, '').split(':')[0];
  if (isVirtualOrInvalidIp(hostPart)) {
    clean = clean.replace(hostPart, activeIp);
  }

  return clean;
};

export const AppConfig = {
  get apiUrl(): string {
    return sanitizeApiUrl(process.env.EXPO_PUBLIC_API_URL);
  },
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
