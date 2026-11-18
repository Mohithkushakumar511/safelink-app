import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { AppConfig } from '@/constants/config';
import { SecureTokenStorage, isValidToken } from './secureStore';

// In-memory token cache for synchronous, zero-latency authorization attachment
let memoryAuthToken: string | null = null;

export const setApiAuthToken = (token: string | null) => {
  if (isValidToken(token)) {
    memoryAuthToken = token.trim();
  } else {
    memoryAuthToken = null;
  }
};

export const getApiAuthToken = (): string | null => {
  return memoryAuthToken;
};

// Listener for auth expiration / session invalidation
type AuthExpiredListener = () => void;
let authExpiredListener: AuthExpiredListener | null = null;

export const setOnAuthExpired = (listener: AuthExpiredListener | null) => {
  authExpiredListener = listener;
};

// Check if an endpoint is public (does not require Bearer JWT token)
export const isPublicEndpoint = (url: string = ''): boolean => {
  const cleanUrl = url.split('?')[0];
  return (
    cleanUrl === '/health' ||
    cleanUrl.startsWith('/health') ||
    cleanUrl === '/auth/login' ||
    cleanUrl.startsWith('/auth/login') ||
    cleanUrl === '/auth/register' ||
    cleanUrl.startsWith('/auth/register') ||
    cleanUrl === '/auth/demo-login' ||
    cleanUrl.startsWith('/auth/demo-login') ||
    cleanUrl.startsWith('/users/qr/') ||
    cleanUrl.startsWith('/sos/ack/')
  );
};

// Create base Axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: AppConfig.apiUrl,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Request Interceptor: Attach Bearer Token automatically & suppress unauthenticated requests to protected endpoints
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Dynamically ensure the active Metro host IP is used
    config.baseURL = AppConfig.apiUrl;

    // 1. Allow public endpoints without authentication header
    if (isPublicEndpoint(config.url)) {
      return config;
    }

    // 2. Resolve latest access token: Check memory cache first, then SecureStore / AsyncStorage
    let token = memoryAuthToken;
    if (!isValidToken(token)) {
      token = await SecureTokenStorage.getToken();
      if (isValidToken(token)) {
        memoryAuthToken = token.trim();
      } else {
        memoryAuthToken = null;
      }
    }

    // 3. Task 6: Prevent protected requests from running before authentication is ready
    if (!isValidToken(token)) {
      return Promise.reject(
        new axios.AxiosError(
          'Authentication required: Missing Authorization Bearer token.',
          'ERR_UNAUTHENTICATED',
          config,
          undefined,
          {
            status: 401,
            statusText: 'Unauthorized',
            headers: {},
            config,
            data: { detail: 'Missing or empty Authorization Bearer token header.' },
          } as any
        )
      );
    }

    // 4. Attach valid Bearer token header to protected request
    const cleanToken = token.trim();
    if (config.headers) {
      if (typeof config.headers.set === 'function') {
        config.headers.set('Authorization', `Bearer ${cleanToken}`);
      } else {
        config.headers.Authorization = `Bearer ${cleanToken}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle 401 Token Expiry & Clear Session
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401 || (error as any).code === 'ERR_UNAUTHENTICATED') {
      const url = error.config?.url || '';
      // Don't clear session on initial login/register credentials failures
      if (!url.includes('/auth/login') && !url.includes('/auth/register') && !url.includes('/auth/demo-login')) {
        console.warn('[API 401] Token expired or invalid, clearing local session.');
        memoryAuthToken = null;
        await SecureTokenStorage.clearSession();
        if (authExpiredListener) {
          try {
            authExpiredListener();
          } catch {}
        }
      }
    }
    return Promise.reject(error);
  }
);

// Format human-friendly error messages with diagnostic guidance
export const formatApiError = (error: any): string => {
  if (axios.isAxiosError(error)) {
    if (error.response?.data?.detail) {
      const detail = error.response.data.detail;
      return typeof detail === 'string' ? detail : JSON.stringify(detail);
    }
    if (error.response?.data?.message) {
      return error.response.data.message;
    }
    if (error.code === 'ECONNABORTED') {
      return (
        `Connection timed out to SafeLink backend at ${AppConfig.apiUrl}.\n` +
        `Please verify your PC and phone are connected to the same Wi-Fi and port 8000 is open.`
      );
    }
    if (error.code === 'ERR_NETWORK' || !error.response) {
      return (
        `Cannot connect to SafeLink backend at ${AppConfig.apiUrl}.\n\n` +
        `Troubleshooting Checklist:\n` +
        `1. Ensure your PC and mobile device are connected to the same Wi-Fi network.\n` +
        `2. Verify the backend is running: python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000\n` +
        `3. Verify Windows Firewall allows inbound connections on port 8000.\n` +
        `4. Test opening in your phone's browser: ${AppConfig.apiUrl}/health`
      );
    }
    return `Server Error (HTTP ${error.response.status}). Please try again.`;
  }
  return error?.message || 'An unexpected error occurred.';
};

export const api = {
  // -------------------------------------------------------------------------
  // Health & Diagnostics
  // -------------------------------------------------------------------------
  health: {
    async check() {
      const res = await apiClient.get('/health', { timeout: 5000 });
      return res.data;
    },

    async ping(timeoutMs = 3500): Promise<{ ok: boolean; latencyMs?: number }> {
      const start = Date.now();
      try {
        await axios.get(`${AppConfig.apiUrl}/health`, { timeout: timeoutMs });
        return { ok: true, latencyMs: Date.now() - start };
      } catch {
        return { ok: false };
      }
    },
  },
  // -------------------------------------------------------------------------
  // Authentication APIs
  // -------------------------------------------------------------------------
  auth: {
    async register(data: { name: string; email: string; password: string; phone_number?: string; blood_type?: string; allergies?: string }) {
      const res = await apiClient.post('/auth/register', data);
      const token = res.data?.access_token || res.data?.token;
      if (isValidToken(token)) {
        const cleanToken = token.trim();
        setApiAuthToken(cleanToken);
        await SecureTokenStorage.saveToken(cleanToken);
        if (res.data?.user) {
          await SecureTokenStorage.saveUser(res.data.user);
        }
      } else {
        console.warn('[API Auth] No valid access_token found in register response:', res.data);
      }
      return res.data;
    },

    async login(data: { email: string; password: string }) {
      const res = await apiClient.post('/auth/login', data);
      const token = res.data?.access_token || res.data?.token;
      if (isValidToken(token)) {
        const cleanToken = token.trim();
        setApiAuthToken(cleanToken);
        await SecureTokenStorage.saveToken(cleanToken);
        if (res.data?.user) {
          await SecureTokenStorage.saveUser(res.data.user);
        }
      } else {
        console.warn('[API Auth] No valid access_token found in login response:', res.data);
      }
      return res.data;
    },

    async demoLogin(role: 'USER' | 'ADMIN' = 'USER') {
      const res = await apiClient.post('/auth/demo-login', { role });
      const token = res.data?.access_token || res.data?.token;
      if (isValidToken(token)) {
        const cleanToken = token.trim();
        setApiAuthToken(cleanToken);
        await SecureTokenStorage.saveToken(cleanToken);
        if (res.data?.user) {
          await SecureTokenStorage.saveUser(res.data.user);
        }
      } else {
        console.warn('[API Auth] No valid access_token found in demo-login response:', res.data);
      }
      return res.data;
    },

    async getMe() {
      const res = await apiClient.get('/auth/me');
      await SecureTokenStorage.saveUser(res.data);
      return res.data;
    },
  },

  // -------------------------------------------------------------------------
  // User Profile APIs
  // -------------------------------------------------------------------------
  users: {
    async getMe() {
      const res = await apiClient.get('/users/me');
      return res.data;
    },

    async updateMe(data: {
      name?: string;
      phone_number?: string;
      blood_type?: string;
      allergies?: string;
      medical_notes?: string;
      existing_conditions?: string;
      medications?: string;
      share_medical_with_sos?: boolean;
    }) {
      const res = await apiClient.put('/users/me', data);
      await SecureTokenStorage.saveUser(res.data);
      return res.data;
    },

    // 1. Secure SOS Cancellation PIN
    async setCancellationPin(pin: string, password?: string) {
      const res = await apiClient.post('/users/cancellation-pin', { pin, password });
      return res.data;
    },

    async verifyCancellationPin(pin: string) {
      const res = await apiClient.post('/users/verify-cancellation-pin', { pin });
      return res.data;
    },

    async resetCancellationPin(password: string, new_pin: string) {
      const res = await apiClient.post('/users/reset-cancellation-pin', { password, new_pin });
      return res.data;
    },

    // 4. Emergency QR Identity Card
    async getQRSettings() {
      const res = await apiClient.get('/users/qr/settings');
      return res.data;
    },

    async updateQRSettings(shared_fields: Record<string, boolean>, emergency_instructions?: string) {
      const res = await apiClient.post('/users/qr/settings', { shared_fields, emergency_instructions });
      return res.data;
    },

    async regenerateQRToken() {
      const res = await apiClient.post('/users/qr/regenerate');
      return res.data;
    },

    async getPublicEmergencyCard(token: string) {
      const res = await apiClient.get(`/users/qr/${token}`);
      return res.data;
    },
  },

  // -------------------------------------------------------------------------
  // Emergency Contacts APIs
  // -------------------------------------------------------------------------
  contacts: {
    async list() {
      const res = await apiClient.get('/contacts');
      return res.data;
    },

    async create(data: { name: string; phone: string; relationship?: string; is_default?: boolean; priority?: number }) {
      const res = await apiClient.post('/contacts', data);
      return res.data;
    },

    async update(contactId: string, data: { name?: string; phone?: string; relationship?: string; is_default?: boolean; priority?: number }) {
      const res = await apiClient.put(`/contacts/${contactId}`, data);
      return res.data;
    },

    async reorder(orders: { id: string; priority: number }[]) {
      const res = await apiClient.put('/contacts/reorder', { orders });
      return res.data;
    },

    async getEscalationSettings() {
      const res = await apiClient.get('/contacts/escalation-settings');
      return res.data;
    },

    async updateEscalationSettings(data: { auto_escalation_enabled: boolean; escalation_timeout_seconds: number }) {
      const res = await apiClient.put('/contacts/escalation-settings', data);
      return res.data;
    },

    async delete(contactId: string) {
      await apiClient.delete(`/contacts/${contactId}`);
    },

    async setDefault(contactId: string) {
      const res = await apiClient.patch(`/contacts/${contactId}/default`);
      return res.data;
    },

    async getDefault() {
      const res = await apiClient.get('/contacts/default');
      return res.data;
    },
  },

  // -------------------------------------------------------------------------
  // GPS & Location APIs
  // -------------------------------------------------------------------------
  location: {
    async update(data: {
      latitude: number;
      longitude: number;
      accuracy?: number;
      altitude?: number;
      heading?: number;
      speed?: number;
      address?: string;
      is_live_sharing?: boolean;
    }) {
      const res = await apiClient.post('/location/update', data);
      return res.data;
    },

    async getCurrent() {
      const res = await apiClient.get('/location/current');
      return res.data;
    },
  },

  // -------------------------------------------------------------------------
  // SOS Emergency APIs
  // -------------------------------------------------------------------------
  sos: {
    async create(data: {
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
      offline_incident_id?: string;
      activated_at?: string;
      created_offline?: boolean;
      retry_count?: number;
      connectivity_method?: string;
    }) {
      const res = await apiClient.post('/sos/create', data);
      return res.data;
    },

    async updateMessageStatus(
      incidentId: string,
      statusData: {
        recipient_contact_id?: string;
        recipient_name?: string;
        recipient_phone?: string;
        message_content?: string;
        sending_method?: string;
        sending_status?: string;
        delivery_confirmation?: string;
        submitted_at?: string;
      }
    ) {
      const res = await apiClient.post(`/sos/${incidentId}/message-status`, statusData);
      return res.data;
    },

    async uploadVoice(incidentId: string, base64Audio: string, durationSeconds?: number) {
      const res = await apiClient.post(`/sos/${incidentId}/voice`, {
        audio_base64: base64Audio,
        file_extension: 'm4a',
        duration_seconds: durationSeconds,
      });
      return res.data;
    },

    getVoiceStreamUrl(incidentId: string) {
      return `${AppConfig.apiUrl}/sos/${incidentId}/voice`;
    },

    async getHistory() {
      const res = await apiClient.get('/sos/history');
      return res.data;
    },

    async getIncident(incidentId: string) {
      const res = await apiClient.get(`/sos/${incidentId}`);
      return res.data;
    },

    async getActive() {
      const res = await apiClient.get('/sos/active');
      return res.data;
    },

    async updateLocation(
      incidentId: string,
      location: {
        latitude: number;
        longitude: number;
        accuracy?: number;
        address?: string;
        battery_level?: number;
        battery_status?: string;
      }
    ) {
      const res = await apiClient.post(`/sos/${incidentId}/location`, location);
      return res.data;
    },

    async getLocations(incidentId: string) {
      const res = await apiClient.get(`/sos/${incidentId}/locations`);
      return res.data;
    },

    async cancel(incidentId: string, reason?: string, pin?: string, passwordBypass?: string) {
      const res = await apiClient.patch(`/sos/${incidentId}/cancel`, {
        reason: reason || 'False alarm / Accidental activation',
        pin: pin || undefined,
        password_bypass: passwordBypass || undefined,
      });
      return res.data;
    },

    async resolve(incidentId: string, resolutionNote?: string) {
      const res = await apiClient.patch(`/sos/${incidentId}/resolve`, {
        resolution_note: resolutionNote || 'Situation safely resolved',
      });
      return res.data;
    },

    async getTimeline(incidentId: string) {
      const res = await apiClient.get(`/sos/${incidentId}/timeline`);
      return res.data;
    },

    async addTimelineEvent(
      incidentId: string,
      event: {
        id?: string;
        event: string;
        title: string;
        description: string;
        timestamp?: string;
        status?: 'Pending' | 'Attempted' | 'Sent' | 'Acknowledged' | 'Failed' | 'Escalated' | 'Resolved';
        latitude?: number;
        longitude?: number;
        accuracy?: number;
        contact_id?: string;
        contact_name?: string;
        contact_phone?: string;
        escalation_level?: number;
        icon?: string;
      }
    ) {
      const res = await apiClient.post(`/sos/${incidentId}/timeline`, event);
      return res.data;
    },

    async syncTimeline(incidentId: string, events: any[]) {
      const res = await apiClient.post(`/sos/${incidentId}/timeline/sync`, { events });
      return res.data;
    },

    async getEscalation(incidentId: string) {
      const res = await apiClient.get(`/sos/${incidentId}/escalation`);
      return res.data;
    },

    async acknowledge(
      incidentId: string,
      data: {
        contact_id?: string;
        contact_name?: string;
        contact_phone?: string;
        response_status: 'I_AM_RESPONDING' | 'UNABLE_TO_RESPOND' | 'ACKNOWLEDGED';
        note?: string;
      }
    ) {
      const res = await apiClient.post(`/sos/${incidentId}/acknowledge`, data);
      return res.data;
    },

    // 3. Rescue Acknowledgement Public Responder Endpoints
    async getPublicAck(incidentId: string) {
      const res = await apiClient.get(`/sos/ack/${incidentId}`);
      return res.data;
    },

    async submitPublicAck(
      incidentId: string,
      data: {
        contact_id?: string;
        contact_name?: string;
        contact_phone?: string;
        response_status: 'I_AM_RESPONDING' | 'UNABLE_TO_RESPOND' | 'ACKNOWLEDGED';
        note?: string;
      }
    ) {
      const res = await apiClient.post(`/sos/ack/${incidentId}`, data);
      return res.data;
    },
  },

  // -------------------------------------------------------------------------
  // Admin APIs (Protected by require_admin)
  // -------------------------------------------------------------------------
  admin: {
    async getDashboard() {
      const res = await apiClient.get('/admin/dashboard');
      return res.data;
    },

    // 5. Emergency Response Analytics
    async getAnalytics(rangeDays?: number | null, statusFilter?: string | null) {
      const params = new URLSearchParams();
      if (rangeDays) params.append('range_days', rangeDays.toString());
      if (statusFilter && statusFilter !== 'ALL') params.append('status_filter', statusFilter);
      const query = params.toString() ? `?${params.toString()}` : '';
      const res = await apiClient.get(`/admin/analytics${query}`);
      return res.data;
    },

    async getUsers() {
      const res = await apiClient.get('/admin/users');
      return res.data;
    },

    async getIncidents(statusFilter?: string) {
      const query = statusFilter && statusFilter !== 'ALL' ? `?status_filter=${statusFilter}` : '';
      const res = await apiClient.get(`/admin/incidents${query}`);
      return res.data;
    },

    async getActiveIncidents() {
      const res = await apiClient.get('/admin/incidents/active');
      return res.data;
    },

    async getIncident(incidentId: string) {
      const res = await apiClient.get(`/admin/incidents/${incidentId}`);
      return res.data;
    },

    async getConnectivityOverview() {
      const res = await apiClient.get('/admin/connectivity/overview');
      return res.data;
    },
  },
};
