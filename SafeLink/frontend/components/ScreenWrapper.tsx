import React, { ReactNode } from 'react';
import { StyleSheet, View, ScrollView, StyleProp, ViewStyle } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { BottomNav, NavTab } from './BottomNav';

interface ScreenWrapperProps {
  children: ReactNode;
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  activeTab?: NavTab;
  headerComponent?: ReactNode;
}

export const ScreenWrapper: React.FC<ScreenWrapperProps> = ({
  children,
  scrollable = false,
  style,
  contentContainerStyle,
  activeTab,
  headerComponent,
}) => {
  const insets = useSafeAreaInsets();
  // Standard height for the bottom navigation bar
  const navPaddingBottom = activeTab ? 78 + insets.bottom : insets.bottom;

  return (
    <View style={[styles.container, { paddingTop: insets.top }, style]}>
      <StatusBar style="light" />

      {headerComponent}

      {scrollable ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.contentContainer,
            { paddingBottom: navPaddingBottom + 20 },
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View
          style={[
            styles.contentContainer,
            styles.nonScrollableContainer,
            { paddingBottom: navPaddingBottom },
            contentContainerStyle,
          ]}
        >
          {children}
        </View>
      )}

      {activeTab && <BottomNav activeTab={activeTab} />}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  nonScrollableContainer: {
    flex: 1,
  },
});
