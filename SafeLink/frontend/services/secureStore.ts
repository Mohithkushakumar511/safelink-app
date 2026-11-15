import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { AppConfig } from '@/constants/config';

/**
 * Validate that a token is a real, non-empty JWT token string.
 * Strictly prevents saving or returning undefined, null, "null", "undefined", or whitespace.
 */
export const isValidToken = (token: any): token is string => {
  if (!token || typeof token !== 'string') return false;
  const trimmed = token.trim();
  return (
    trimmed.length > 10 &&
    trimmed !== 'null' &&
    trimmed !== 'undefined' &&
    trimmed !== '[object Object]' &&
    !trimmed.includes('undefined')
  );
};

export const SecureTokenStorage = {
  /**
   * Persist JWT access token in SecureStore and mirror to AsyncStorage.
   * Never writes null, undefined, or empty values.
   */
  async saveToken(token: string): Promise<void> {
    if (!isValidToken(token)) {
      console.warn('[SecureStore] Prevented writing invalid token value to storage.');
      return;
    }
    const cleanToken = token.trim();
    try {
      if (Platform.OS !== 'web') {
        await SecureStore.setItemAsync(AppConfig.storageKeys.token, cleanToken);
      }
    } catch (e) {
      console.warn('[SecureStore] SecureStore write notice:', e);
    }
    try {
      await AsyncStorage.setItem(AppConfig.storageKeys.token, cleanToken);
    } catch (e) {
      console.warn('[SecureStore] AsyncStorage mirror write notice:', e);
    }
  },

  /**
   * Retrieve JWT access token with fallback to AsyncStorage mirror.
   * Returns null if missing, empty, or corrupted.
   */
  async getToken(): Promise<string | null> {
    // 1. Try SecureStore on mobile first
    try {
      if (Platform.OS !== 'web') {
        const token = await SecureStore.getItemAsync(AppConfig.storageKeys.token);
        if (isValidToken(token)) {
          return token.trim();
        }
      }
    } catch (e) {
      console.warn('[SecureStore] SecureStore read notice:', e);
    }

    // 2. Fall back to AsyncStorage mirror
    try {
      const fallback = await AsyncStorage.getItem(AppConfig.storageKeys.token);
      if (isValidToken(fallback)) {
        return fallback.trim();
      }
    } catch (e) {
      console.warn('[SecureStore] AsyncStorage mirror read notice:', e);
    }

    return null;
  },

  /**
   * Remove token from both SecureStore and AsyncStorage.
   */
  async deleteToken(): Promise<void> {
    try {
      if (Platform.OS !== 'web') {
        await SecureStore.deleteItemAsync(AppConfig.storageKeys.token);
      }
    } catch {}
    try {
      await AsyncStorage.removeItem(AppConfig.storageKeys.token);
    } catch {}
  },

  /**
   * Cache user profile JSON.
   */
  async saveUser(user: any): Promise<void> {
    if (!user) return;
    try {
      await AsyncStorage.setItem(AppConfig.storageKeys.user, JSON.stringify(user));
    } catch (e) {
      console.warn('[SecureStore] User cache write notice:', e);
    }
  },

  /**
   * Retrieve cached user profile.
   */
  async getUser(): Promise<any | null> {
    try {
      const raw = await AsyncStorage.getItem(AppConfig.storageKeys.user);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  /**
   * Clear all session data (token and cached user profile).
   */
  async clearSession(): Promise<void> {
    await this.deleteToken();
    try {
      await AsyncStorage.removeItem(AppConfig.storageKeys.user);
    } catch {}
  }
};
