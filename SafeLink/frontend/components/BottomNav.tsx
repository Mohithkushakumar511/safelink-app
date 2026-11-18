import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';

export type NavTab = 'home' | 'contacts' | 'alerts' | 'location' | 'settings';

interface BottomNavProps {
  activeTab: NavTab;
}

interface TabItem {
  id: NavTab;
  label: string;
  iconActive: keyof typeof Ionicons.glyphMap;
  iconInactive: keyof typeof Ionicons.glyphMap;
  route: string;
}

const TABS: TabItem[] = [
  {
    id: 'home',
    label: 'Home',
    iconActive: 'shield',
    iconInactive: 'shield-outline',
    route: '/dashboard',
  },
  {
    id: 'contacts',
    label: 'Contacts',
    iconActive: 'people',
    iconInactive: 'people-outline',
    route: '/contacts',
  },
  {
    id: 'alerts',
    label: 'Alert Status',
    iconActive: 'notifications',
    iconInactive: 'notifications-outline',
    route: '/alert-status',
  },
  {
    id: 'location',
    label: 'Location',
    iconActive: 'location',
    iconInactive: 'location-outline',
    route: '/live-location',
  },
  {
    id: 'settings',
    label: 'Settings',
    iconActive: 'settings',
    iconInactive: 'settings-outline',
    route: '/settings',
  },
];

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab }) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleTabPress = (route: string, tabId: NavTab) => {
    if (tabId === activeTab) return;
    router.replace(route as any);
  };

  return (
    <View
      style={[
        styles.navContainer,
        {
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}
    >
      <View style={styles.tabRow}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              onPress={() => handleTabPress(tab.route, tab.id)}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${tab.label} tab`}
            >
              <View style={[styles.iconWrapper, isActive && styles.iconWrapperActive]}>
                <Ionicons
                  name={isActive ? tab.iconActive : tab.iconInactive}
                  size={22}
                  color={isActive ? Colors.emergencyRedBright : Colors.textMuted}
                />
              </View>
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  navContainer: {
    backgroundColor: '#070D1F',
    borderTopWidth: 1,
    borderTopColor: '#172554',
    paddingTop: 8,
    paddingHorizontal: 4,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    elevation: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderRadius: 12,
  },
  tabButtonActive: {
    // Subtle active highlighting
  },
  iconWrapper: {
    width: 36,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  iconWrapperActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMuted,
    marginTop: 2,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  tabLabelActive: {
    color: Colors.emergencyRedBright,
    fontWeight: '700',
  },
});
