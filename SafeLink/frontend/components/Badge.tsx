import React from 'react';
import { StyleSheet, Text, View, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { Colors } from '@/constants/colors';

export type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export const Badge: React.FC<BadgeProps> = ({
  label,
  variant = 'neutral',
  style,
  textStyle,
}) => {
  const getContainerStyle = () => {
    switch (variant) {
      case 'success':
        return styles.successBg;
      case 'danger':
        return styles.dangerBg;
      case 'warning':
        return styles.warningBg;
      case 'info':
        return styles.infoBg;
      case 'neutral':
      default:
        return styles.neutralBg;
    }
  };

  const getTextStyle = () => {
    switch (variant) {
      case 'success':
        return styles.successText;
      case 'danger':
        return styles.dangerText;
      case 'warning':
        return styles.warningText;
      case 'info':
        return styles.infoText;
      case 'neutral':
      default:
        return styles.neutralText;
    }
  };

  return (
    <View style={[styles.badge, getContainerStyle(), style]}>
      <Text style={[styles.text, getTextStyle(), textStyle]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  successBg: {
    backgroundColor: Colors.safetyGreenBadge,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  successText: {
    color: Colors.safetyGreen,
  },
  dangerBg: {
    backgroundColor: Colors.emergencyBadge,
    borderColor: 'rgba(220, 38, 38, 0.4)',
  },
  dangerText: {
    color: Colors.emergencyRedBright,
  },
  warningBg: {
    backgroundColor: Colors.warningAmberBadge,
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  warningText: {
    color: Colors.warningAmber,
  },
  infoBg: {
    backgroundColor: Colors.infoBlueBadge,
    borderColor: 'rgba(59, 130, 246, 0.4)',
  },
  infoText: {
    color: Colors.infoBlue,
  },
  neutralBg: {
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
    borderColor: 'rgba(148, 163, 184, 0.25)',
  },
  neutralText: {
    color: Colors.textSecondary,
  },
});
