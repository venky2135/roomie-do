import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../lib/supabase';
import { Profile } from '../store/useAuthStore';
import {
  Badge,
  BadgeStats,
  DEFAULT_STATS,
  computeBadges,
  countEarned,
} from '../lib/badgeEngine';
import { isLogApproved, parseLogNotes } from '../lib/taskWorkflow';
import { COLORS, RADIUS } from '../constants/theme';
import BadgeNode from './BadgeNode';
import BadgeDetailSheet from './BadgeDetailSheet';

interface BadgesJourneyProps {
  profile: Profile | null;
  /** Pre-fetched approved count from profile screen (avoid double-fetch) */
  approvedCount: number;
}

export default function BadgesJourney({ profile, approvedCount }: BadgesJourneyProps) {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const scrollRef = useRef<any>(null);

  // ── Progress bar animation ───────────────────────────────────
  const barWidth = useSharedValue(0);
  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value * 100}%` as any,
  }));

  // ── Load supplemental stats & compute badges ─────────────────
  useEffect(() => {
    if (!profile?.id) return;
    loadBadges();
  }, [profile?.id, approvedCount]);

  const loadBadges = async () => {
    if (!profile?.id) return;
    setLoading(true);

    try {
      // Single Supabase query — join task_templates for category
      const { data: logs } = await supabase
        .from('task_logs')
        .select('notes, photo_url, completed_at, task_templates(category)')
        .eq('user_id', profile.id);

      const stats: BadgeStats = { ...DEFAULT_STATS, approvedCount };

      if (logs) {
        for (const log of logs) {
          const approved = isLogApproved(log.notes);
          if (!approved) continue;

          // Parse category safely
          const category = (log as any).task_templates?.category ?? '';

          if (category === 'Cleaning') stats.cleaningCount++;
          if (category === 'Marketplace') stats.marketplaceCount++;

          // Weekend check
          const date = new Date(log.completed_at);
          const day = date.getDay(); // 0=Sun, 6=Sat
          if (day === 0 || day === 6) stats.weekendCount++;

          // Photo proof
          if (log.photo_url) stats.photoProofCount++;

          // Leave approved
          try {
            const meta = JSON.parse(log.notes || '{}');
            if (meta.type === 'leave_request' && meta.status === 'approved') {
              stats.leaveApprovedCount++;
            }
          } catch {}

          // Count reactions given (from log metadata reactions field)
          try {
            const meta = parseLogNotes(log.notes);
            const reactions = meta.reactions ?? {};
            const givenCount = Object.values(reactions).filter((users) =>
              (users as string[]).includes(profile.id)
            ).length;
            stats.reactionsGiven += givenCount;
          } catch {}
        }
      }

      const computed = computeBadges(profile, stats);
      setBadges(computed);

      // Animate progress bar
      const ratio = countEarned(computed) / computed.length;
      barWidth.value = withTiming(ratio, {
        duration: 1000,
        easing: Easing.out(Easing.cubic),
      });

      // Auto-scroll to first locked badge
      setTimeout(() => {
        const firstLockedIdx = computed.findIndex((b) => !b.earned);
        if (firstLockedIdx > 0 && scrollRef.current) {
          scrollRef.current.scrollTo({
            x: Math.max(0, (firstLockedIdx - 1) * 76),
            animated: true,
          });
        }
      }, 600);
    } catch (err) {
      console.warn('BadgesJourney: failed to load stats', err);
    } finally {
      setLoading(false);
    }
  };

  const earnedCount = badges.filter((b) => b.earned).length;
  const totalCount = badges.length;

  return (
    <View style={styles.container}>
      {/* ── Section Header ── */}
      <View style={styles.sectionHeaderRow}>
        <Ionicons name="ribbon-outline" size={18} color={COLORS.text} />
        <Text style={styles.sectionTitle}>Badge Journey</Text>
        {!loading && (
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>
              {earnedCount}/{totalCount}
            </Text>
          </View>
        )}
      </View>

      {/* ── Progress Rail ── */}
      <View style={styles.progressRail}>
        <Animated.View style={[styles.progressFill, barStyle]} />
      </View>
      {!loading && (
        <Text style={styles.progressLabel}>
          {earnedCount} of {totalCount} badges unlocked
        </Text>
      )}

      {/* ── Journey Scroll ── */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      ) : (
        <View style={styles.journeyCard}>
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {badges.map((badge, index) => (
              <React.Fragment key={badge.id}>
                {/* Badge node */}
                <BadgeNode
                  badge={badge}
                  index={index}
                  onPress={setSelectedBadge}
                />
                {/* Connector line between nodes */}
                {index < badges.length - 1 && (
                  <View style={styles.connectorWrapper}>
                    <View
                      style={[
                        styles.connectorLine,
                        badge.earned && styles.connectorLineEarned,
                      ]}
                    />
                    {badge.earned && (
                      <Ionicons
                        name="checkmark"
                        size={8}
                        color={COLORS.primary}
                        style={styles.connectorCheck}
                      />
                    )}
                  </View>
                )}
              </React.Fragment>
            ))}
          </ScrollView>

          {/* Scroll hint arrow */}
          <View style={styles.scrollHint}>
            <Ionicons name="chevron-forward" size={12} color={COLORS.textLight} />
          </View>
        </View>
      )}

      {/* ── Badge Detail Sheet ── */}
      <BadgeDetailSheet
        badge={selectedBadge}
        onClose={() => setSelectedBadge(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A1A24',
    flex: 1,
  },
  countPill: {
    backgroundColor: COLORS.primary + '22',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  countPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
  },
  progressRail: {
    height: 5,
    backgroundColor: '#ECECEC',
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
  },
  progressLabel: {
    fontSize: 9,
    color: '#7E7E8F',
    fontWeight: '600',
    marginBottom: 10,
  },
  loadingBox: {
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  journeyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#ECECEC',
    paddingVertical: 14,
    paddingLeft: 10,
    paddingRight: 28, // space for the scroll hint arrow
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    position: 'relative',
  },
  scrollContent: {
    alignItems: 'center',
    paddingRight: 8,
  },
  connectorWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 54,
  },
  connectorLine: {
    width: 18,
    height: 2,
    backgroundColor: '#E0E0E0',
    borderRadius: 1,
  },
  connectorLineEarned: {
    backgroundColor: COLORS.primary,
    height: 3,
  },
  connectorCheck: {
    position: 'absolute',
    top: '50%',
    marginTop: -4,
  },
  scrollHint: {
    position: 'absolute',
    right: 6,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    opacity: 0.6,
  },
});
