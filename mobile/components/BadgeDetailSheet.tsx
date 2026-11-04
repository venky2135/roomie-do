import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Badge } from '../lib/badgeEngine';
import { COLORS, RADIUS } from '../constants/theme';

interface BadgeDetailSheetProps {
  badge: Badge | null;
  onClose: () => void;
}

export default function BadgeDetailSheet({ badge, onClose }: BadgeDetailSheetProps) {
  // ── Sheet slide-up animation ─────────────────────────────────
  const slideAnim = useRef(new Animated.Value(300)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  // ── Badge icon pulse (for earned badges) ─────────────────────
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (badge) {
      // Slide in
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(overlayAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();

      // Start pulse loop for earned badge icon
      if (badge.earned) {
        pulseLoop.current = Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.18,
              duration: 700,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 700,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ])
        );
        pulseLoop.current.start();
      } else {
        pulseAnim.setValue(1);
      }
    } else {
      // Slide out
      pulseLoop.current?.stop();
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 300,
          duration: 240,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(overlayAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }

    return () => {
      pulseLoop.current?.stop();
    };
  }, [badge]);

  if (!badge) return null;

  const progressPercent = Math.round(badge.progress * 100);

  return (
    <Modal visible={!!badge} transparent animationType="none" onRequestClose={onClose}>
      {/* ── Overlay ── */}
      <Animated.View style={[styles.overlay, { opacity: overlayAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill as any} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      {/* ── Sheet ── */}
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
      >
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Close button */}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Ionicons name="close" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>

        {/* Badge icon hero */}
        <View style={styles.heroArea}>
          {/* Glow ring behind icon */}
          {badge.earned && (
            <View
              style={[
                styles.glowRing,
                { backgroundColor: badge.color + '20', borderColor: badge.color + '40' },
              ]}
            />
          )}

          <Animated.View
            style={[
              styles.bigIconCircle,
              {
                backgroundColor: badge.earned ? badge.color + '18' : '#F5F5F5',
                borderColor: badge.earned ? badge.color : '#E0E0E0',
                transform: [{ scale: pulseAnim }],
              },
            ]}
          >
            <Ionicons
              name={badge.icon as any}
              size={42}
              color={badge.earned ? badge.color : '#BDBDBD'}
            />

            {/* Lock icon overlay for locked */}
            {!badge.earned && (
              <View style={styles.bigLockOverlay}>
                <Ionicons name="lock-closed" size={12} color="#9E9E9E" />
              </View>
            )}
          </Animated.View>

          {/* Earned star badge */}
          {badge.earned && (
            <View style={[styles.earnedStarBadge, { backgroundColor: badge.color }]}>
              <Ionicons name="checkmark" size={10} color="#FFF" />
            </View>
          )}
        </View>

        {/* Badge name & state label */}
        <Text style={styles.badgeName}>{badge.name}</Text>
        <View
          style={[
            styles.statePill,
            { backgroundColor: badge.earned ? badge.color + '18' : '#F5F5F5' },
          ]}
        >
          <Ionicons
            name={badge.earned ? 'checkmark-circle' : 'lock-closed-outline'}
            size={11}
            color={badge.earned ? badge.color : COLORS.textLight}
          />
          <Text
            style={[
              styles.statePillText,
              { color: badge.earned ? badge.color : COLORS.textLight },
            ]}
          >
            {badge.earned ? 'Earned' : 'Locked'}
          </Text>
        </View>

        {/* Description */}
        <Text style={styles.description}>{badge.description}</Text>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Unlock condition */}
        <View style={styles.conditionRow}>
          <Ionicons name="flag-outline" size={14} color={COLORS.textSecondary} />
          <Text style={styles.conditionText}>{badge.condition}</Text>
        </View>

        {/* Progress bar — only for locked, goal > 0 */}
        {!badge.earned && badge.goal > 0 && (
          <View style={styles.progressSection}>
            <View style={styles.progressLabelRow}>
              <Text style={styles.progressLabelText}>Progress</Text>
              <Text style={styles.progressLabelText}>
                {badge.current}/{badge.goal}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressBar,
                  {
                    width: `${progressPercent}%` as any,
                    backgroundColor: badge.color,
                  },
                ]}
              />
            </View>
            <Text style={styles.progressHint}>
              {badge.goal - badge.current} more to unlock this badge
            </Text>
          </View>
        )}

        {/* XP reward chip — only if relevant */}
        {badge.xpReward > 0 && (
          <View style={styles.xpChip}>
            <Ionicons name="flash" size={12} color="#FF9800" />
            <Text style={styles.xpChipText}>
              {badge.xpReward} XP reward
            </Text>
          </View>
        )}

        {/* Bottom spacer for home indicator */}
        <View style={styles.bottomSpacer} />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    minHeight: 320,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 10,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 16,
    padding: 4,
  },
  heroArea: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
    position: 'relative',
  },
  glowRing: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1.5,
  },
  bigIconCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    position: 'relative',
  },
  bigLockOverlay: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  earnedStarBadge: {
    position: 'absolute',
    top: 2,
    right: '30%',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  badgeName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A1A24',
    textAlign: 'center',
    marginBottom: 6,
  },
  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    alignSelf: 'center',
    marginBottom: 10,
  },
  statePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  description: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginBottom: 12,
  },
  conditionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  conditionText: {
    fontSize: 12,
    color: '#1A1A24',
    fontWeight: '600',
    flex: 1,
  },
  progressSection: {
    marginBottom: 12,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  progressLabelText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  progressTrack: {
    height: 7,
    backgroundColor: '#ECECEC',
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressBar: {
    height: '100%',
    borderRadius: RADIUS.full,
  },
  progressHint: {
    fontSize: 9,
    color: COLORS.textLight,
    fontWeight: '600',
  },
  xpChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  xpChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF9800',
  },
  bottomSpacer: {
    height: Platform.OS === 'ios' ? 24 : 12,
  },
});
