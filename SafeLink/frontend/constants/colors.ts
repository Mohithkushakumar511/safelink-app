export const Colors = {
  // Backgrounds & Surface (Dark Navy & Slate)
  background: '#0A1128',
  cardBackground: '#101F42',
  cardBorder: '#1E356D',
  surfaceLight: '#162852',
  inputBackground: '#0D1836',

  // Emergency Red Palette
  emergencyRed: '#DC2626',
  emergencyRedBright: '#EF4444',
  emergencyRedDark: '#991B1B',
  emergencyGlow: 'rgba(220, 38, 38, 0.4)',
  emergencyBadge: 'rgba(220, 38, 38, 0.15)',

  // Status & Utility Colors
  safetyGreen: '#10B981',
  safetyGreenDark: '#047857',
  safetyGreenBadge: 'rgba(16, 185, 129, 0.15)',
  warningAmber: '#F59E0B',
  warningAmberBadge: 'rgba(245, 158, 11, 0.15)',
  infoBlue: '#3B82F6',
  infoBlueBadge: 'rgba(59, 130, 246, 0.15)',

  // Typography
  textPrimary: '#FFFFFF',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  textDark: '#0A1128',

  // Dividers & Accents
  border: '#1E356D',
  borderLight: '#2C4785',
  divider: '#182B57',
} as const;

export type ColorKeys = keyof typeof Colors;
