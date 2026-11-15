import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/constants/colors';

export default function IndexScreen() {
  const { isLoading, isAuthenticated } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  // Safety fallback: if auth takes more than 1.5 seconds, force proceed so the spinner never hangs
  useEffect(() => {
    const timer = setTimeout(() => {
      setTimedOut(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  if (!isLoading || timedOut) {
    if (isAuthenticated) {
      return <Redirect href="/dashboard" />;
    }
    return <Redirect href="/login" />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.logoCircle}>
        <Ionicons name="shield-checkmark" size={56} color={Colors.emergencyRedBright} />
      </View>
      <Text style={styles.appName}>SAFELINK</Text>
      <Text style={styles.tagline}>Emergency Safeguard & Live Location</Text>
      <ActivityIndicator size="small" color={Colors.emergencyRedBright} style={{ marginTop: 28 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  logoCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: Colors.emergencyBadge,
    borderWidth: 2,
    borderColor: 'rgba(220, 38, 38, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: Colors.emergencyRed,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  appName: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.textPrimary,
    letterSpacing: 3,
  },
  tagline: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
});
