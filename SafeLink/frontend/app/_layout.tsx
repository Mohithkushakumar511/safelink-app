import React from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/hooks/useAuth';
import { Colors } from '@/constants/colors';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: Colors.background,
            },
            headerTintColor: Colors.textPrimary,
            headerTitleStyle: {
              fontWeight: '700',
              fontSize: 18,
            },
            headerShadowVisible: false,
            contentStyle: {
              backgroundColor: Colors.background,
            },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="signup" options={{ headerShown: false }} />
          <Stack.Screen name="dashboard" options={{ headerShown: false }} />
          <Stack.Screen name="contacts" options={{ headerShown: false }} />
          <Stack.Screen name="alert-status" options={{ headerShown: false }} />
          <Stack.Screen name="live-location" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen
            name="sos"
            options={{
              title: 'Emergency SOS Console',
              headerBackVisible: false,
            }}
          />
          <Stack.Screen
            name="history"
            options={{
              title: 'Incident History',
            }}
          />
          <Stack.Screen
            name="incident-details"
            options={{
              headerShown: false,
            }}
          />

          <Stack.Screen
            name="admin/dashboard"
            options={{
              title: 'Admin Command Center',
            }}
          />
          <Stack.Screen
            name="admin/users"
            options={{
              title: 'Registered Users',
            }}
          />
          <Stack.Screen
            name="admin/incidents"
            options={{
              title: 'Emergency Incident Records',
            }}
          />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
