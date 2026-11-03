import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS } from '../constants/theme';

export type IconName = keyof typeof Ionicons.glyphMap;

interface AppIconProps {
  name?: string;
  category?: string;
  size?: number;
  color?: string;
}

const EMOJI_TO_ICON: Record<string, IconName> = {
  '🧹': 'sparkles-outline',
  '🍳': 'restaurant-outline',
  '🗑️': 'trash-outline',
  '🧺': 'shirt-outline',
  '🛒': 'cart-outline',
  '🧽': 'water-outline',
  '🛋️': 'tv-outline',
  '🪴': 'leaf-outline',
  '🧼': 'hand-left-outline',
  '📦': 'cube-outline',
  '🐶': 'paw-outline',
  '🐱': 'paw-outline',
  '🍽️': 'cafe-outline',
  '🛏️': 'bed-outline',
};

const CATEGORY_TO_ICON: Record<string, IconName> = {
  Kitchen: 'restaurant-outline',
  Bathroom: 'water-outline',
  'Living Room': 'tv-outline',
  Groceries: 'cart-outline',
  'Trash & Recycling': 'trash-outline',
  General: 'sparkles-outline',
  Marketplace: 'storefront-outline',
  Bounty: 'gift-outline',
};

export default function AppIcon({
  name,
  category,
  size = 22,
  color = COLORS.primary,
}: AppIconProps) {
  let iconName: IconName = 'checkbox-outline';

  if (name && (name in Ionicons.glyphMap)) {
    iconName = name as IconName;
  } else if (name && EMOJI_TO_ICON[name]) {
    iconName = EMOJI_TO_ICON[name];
  } else if (category && CATEGORY_TO_ICON[category]) {
    iconName = CATEGORY_TO_ICON[category];
  }

  return <Ionicons name={iconName} size={size} color={color} />;
}
