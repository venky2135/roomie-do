export const COLORS = {
  primary: '#4CAF82',       // Green — main brand color
  primaryDark: '#2E7D5A',
  primaryLight: '#A8D5B9',
  accent: '#FF7043',        // Orange — highlights, badges
  accentLight: '#FFCCBC',
  background: '#F5F5F0',    // Warm off-white
  card: '#FFFFFF',
  border: '#E0E0E0',
  text: '#1A1A2E',
  textSecondary: '#6B6B80',
  textLight: '#A0A0B0',
  success: '#4CAF50',
  warning: '#FFC107',
  error: '#F44336',
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',

  // Dark mode
  darkBackground: '#0F1923',
  darkCard: '#1A2530',
  darkBorder: '#2A3540',
  darkText: '#E8EDF2',
  darkTextSecondary: '#8A9BAB',
} as const;

export const FONTS = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
  sizes: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    xxl: 30,
    xxxl: 38,
  },
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export const CATEGORY_COLORS: Record<string, string> = {
  Kitchen: '#FF7043',
  Cleaning: '#4CAF82',
  Laundry: '#5C6BC0',
  Shopping: '#FFA726',
  General: '#78909C',
};

export const LEVEL_TITLES: Record<number, string> = {
  1: 'Rookie',
  2: 'Helper',
  3: 'Contributor',
  4: 'Cleaner',
  5: 'Organizer',
  6: 'House Pro',
  7: 'Master Chef',
  8: 'Super Roomie',
  9: 'Legend',
  10: 'House God',
};

export const getLevelTitle = (level: number): string =>
  LEVEL_TITLES[Math.min(level, 10)] ?? 'House God';

