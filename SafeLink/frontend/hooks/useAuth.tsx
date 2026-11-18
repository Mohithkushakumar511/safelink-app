import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, formatApiError, setApiAuthToken, setOnAuthExpired } from '@/services/api';
import { SecureTokenStorage, isValidToken } from '@/services/secureStore';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  display_name: string;
  phone_number?: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED';
  blood_type?: string;
  allergies?: string;
  medical_notes?: string;
  existing_conditions?: string;
  medications?: string;
  share_medical_with_sos?: boolean;
  cancellation_pin_set?: boolean;
  qr_token?: string;
  qr_shared_fields?: string[];
  language_preference?: string;
  emergency_instructions?: string;
  created_at: string;
}

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, pass: string) => Promise<void>;
  signup: (data: { name: string; email: string; password: string; phone_number?: string; blood_type?: string; allergies?: string }) => Promise<void>;
  demoLogin: (role: 'USER' | 'ADMIN') => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initialize session on mount
  useEffect(() => {
    let isMounted = true;

    // Listen for auth expiration across the app
    setOnAuthExpired(() => {
      if (isMounted) {
        setUser(null);
      }
    });

    const initSession = async () => {
      try {
        // 1. Read saved JWT token and cached user from SecureStore / AsyncStorage
        const token = await SecureTokenStorage.getToken();
        const cachedUser = await SecureTokenStorage.getUser();

        // 2. Validate that a token exists and is valid
        if (isValidToken(token)) {
          setApiAuthToken(token);

          if (cachedUser && isMounted) {
            setUser(cachedUser);
          } else if (isMounted) {
            // Restore session with valid placeholder profile while background refresh runs
            setUser({
              id: 'restored_session',
              email: 'user@safelink.local',
              name: 'SafeLink User',
              display_name: 'SafeLink User',
              role: 'USER',
              status: 'ACTIVE',
              created_at: new Date().toISOString(),
            });
          }

          // 3. Background profile refresh (does not block startup or wipe session on offline/slow network)
          api.auth.getMe()
            .then((liveUser) => {
              if (isMounted && liveUser) {
                setUser(liveUser);
              }
            })
            .catch((netErr) => {
              console.warn('[useAuth] Background profile refresh notice:', netErr?.message || netErr);
            });
        } else {
          setApiAuthToken(null);
          if (isMounted) setUser(null);
        }
      } catch (err) {
        console.warn('[useAuth] Session init error:', err);
      } finally {
        // 4. Complete authentication initialization
        if (isMounted) setIsLoading(false);
      }
    };

    initSession();
    return () => {
      isMounted = false;
      setOnAuthExpired(null);
    };
  }, []);

  const login = async (email: string, pass: string) => {
    setIsLoading(true);
    try {
      const res = await api.auth.login({ email: email.trim(), password: pass });
      if (res?.user) {
        setUser(res.user);
      }
    } catch (e: any) {
      throw new Error(formatApiError(e));
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (data: { name: string; email: string; password: string; phone_number?: string; blood_type?: string; allergies?: string }) => {
    setIsLoading(true);
    try {
      const res = await api.auth.register(data);
      if (res?.user) {
        setUser(res.user);
      }
    } catch (e: any) {
      throw new Error(formatApiError(e));
    } finally {
      setIsLoading(false);
    }
  };

  const demoLogin = async (role: 'USER' | 'ADMIN') => {
    setIsLoading(true);
    try {
      const res = await api.auth.demoLogin(role);
      if (res?.user) {
        setUser(res.user);
      }
    } catch (e: any) {
      throw new Error(formatApiError(e));
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      setApiAuthToken(null);
      await SecureTokenStorage.clearSession();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshUser = async () => {
    try {
      const liveUser = await api.auth.getMe();
      setUser(liveUser);
    } catch (e) {
      console.warn('[useAuth] refreshUser failed:', e);
    }
  };

  const updateProfile = async (data: any) => {
    const updated = await api.users.updateMe(data);
    setUser(updated);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: Boolean(user),
        login,
        signup,
        demoLogin,
        logout,
        refreshUser,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
