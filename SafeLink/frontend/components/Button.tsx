import React, { ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';
import { Colors } from '@/constants/colors';

export type ButtonVariant = 'primary' | 'emergency' | 'secondary' | 'outline' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  leftIcon,
  rightIcon,
  style,
  textStyle,
}) => {
  const getContainerStyle = () => {
    switch (variant) {
      case 'emergency':
        return styles.emergencyContainer;
      case 'secondary':
        return styles.secondaryContainer;
      case 'outline':
        return styles.outlineContainer;
      case 'danger':
        return styles.dangerContainer;
      case 'primary':
      default:
        return styles.primaryContainer;
    }
  };

  const getTextStyle = () => {
    switch (variant) {
      case 'outline':
        return styles.outlineText;
      case 'secondary':
        return styles.secondaryText;
      case 'emergency':
      case 'danger':
      case 'primary':
      default:
        return styles.primaryText;
    }
  };

  const getSizeStyle = () => {
    switch (size) {
      case 'sm':
        return styles.smContainer;
      case 'lg':
        return styles.lgContainer;
      case 'md':
      default:
        return styles.mdContainer;
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
      style={[
        styles.baseContainer,
        getContainerStyle(),
        getSizeStyle(),
        disabled && styles.disabledContainer,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'outline' ? Colors.infoBlue : '#FFFFFF'}
        />
      ) : (
        <View style={styles.contentRow}>
          {leftIcon && <View style={styles.leftIconWrapper}>{leftIcon}</View>}
          <Text style={[styles.baseText, getTextStyle(), textStyle]}>
            {title}
          </Text>
          {rightIcon && <View style={styles.rightIconWrapper}>{rightIcon}</View>}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  baseContainer: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  baseText: {
    fontWeight: '700',
    textAlign: 'center',
  },
  leftIconWrapper: {
    marginRight: 8,
  },
  rightIconWrapper: {
    marginLeft: 8,
  },
  smContainer: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  mdContainer: {
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  lgContainer: {
    paddingVertical: 18,
    paddingHorizontal: 24,
  },
  primaryContainer: {
    backgroundColor: Colors.infoBlue,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  emergencyContainer: {
    backgroundColor: Colors.emergencyRed,
    shadowColor: Colors.emergencyRed,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  secondaryContainer: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryText: {
    color: Colors.textPrimary,
    fontSize: 14,
  },
  outlineContainer: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
  },
  outlineText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  dangerContainer: {
    backgroundColor: Colors.emergencyRedDark,
  },
  disabledContainer: {
    opacity: 0.5,
  },
});
