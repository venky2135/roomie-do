import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Badge } from '../lib/badgeEngine';
import { RADIUS } from '../constants/theme';

interface BadgeNodeProps {
  badge: Badge;
  index: number;
  onPress: (badge: Badge) => void;
}

const NODE_SIZE = 54;

export default function BadgeNode({ badge, index, onPress }: BadgeNodeProps) {
  // ── Mount spring pop-in ──────────────────────────────────────
  const scale = useSharedValue(0);
  const iconScale = useSharedValue(1);

  useEffect(() => {
    // Stagger entrance animation by index
    const delay = index * 80;
    const timeout = setTimeout(() => {
      scale.value = withSpring(1, { damping: 10, stiffness: 180 });

      if (badge.earned) {
        // Subtle breathing pulse on the icon itself
        iconScale.value = withRepeat(
          withSequence(
            withTiming(1.15, { duration: 900, easing: Easing.inOut(Easing.ease) }),
            withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          ),
          -1,
          false,
        );
      }
    }, delay);

    return () => clearTimeout(timeout);
  }, [badge.earned]);

  // ── Animated styles ──────────────────────────────────────────
  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  const isEarned = badge.earned;

  return (
    <Animated.View style={[styles.wrapper, containerStyle]}>
      <TouchableOpacity
        onPress={() => onPress(badge)}
        activeOpacity={0.75}
        style={styles.touchable}
      >
        {/* Main circle */}
        <View
          style={[
            styles.circle,
            isEarned && {
              backgroundColor: '#FFFFFF',
              borderColor: badge.color,
              borderWidth: 2,
            },
            !isEarned && styles.circleLocked,
          ]}
        >
          {/* Animated Icon */}
          <Animated.View style={iconStyle}>
            <Ionicons
              name={badge.icon as any}
              size={26}
              color={isEarned ? badge.color : '#BDBDBD'}
            />
          </Animated.View>

          {/* Lock overlay for locked badges */}
          {!isEarned && (
            <View style={styles.lockOverlay}>
              <Ionicons name="lock-closed" size={9} color="#9E9E9E" />
            </View>
          )}
        </View>

        {/* Badge name */}
        <Text
          style={[styles.label, !isEarned && styles.labelLocked]}
          numberOfLines={2}
        >
          {badge.name}
        </Text>

        {/* Earned check dot */}
        {isEarned && <View style={[styles.earnedDot, { backgroundColor: badge.color }]} />}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    width: 76,
    marginHorizontal: 1,
    paddingTop: 6,
    paddingBottom: 4,
  },
  touchable: {
    alignItems: 'center',
    width: '100%',
  },
  circle: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F9FA',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    position: 'relative',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  circleLocked: {
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    opacity: 0.5,
  },
  lockOverlay: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    width: 15,
    height: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  label: {
    fontSize: 9,
    fontWeight: '700',
    color: '#1A1A24',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 12,
    minHeight: 24,
  },
  labelLocked: {
    color: '#BDBDBD',
  },
  earnedDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 3,
  },
});

