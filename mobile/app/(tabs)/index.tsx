import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { fetchLeaderboard } from '../../lib/api';
import { useAuthStore } from '../../store/useAuthStore';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

export default function HomeScreen() {
  const { profile, refreshProfile } = useAuthStore();
  const [topMembers, setTopMembers] = useState<any[]>([]);
  const [todayCount, setTodayCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    if (!profile?.house_id) return;

    // Today's completed tasks by current user
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('task_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .gte('completed_at', today.toISOString());
    setTodayCount(count ?? 0);

    // Top 3 leaderboard
    try {
      const res = await fetchLeaderboard(profile.house_id, 'week');
      setTopMembers(res.data.leaderboard.slice(0, 3));
    } catch (_) {}
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadData(), refreshProfile()]);
    setRefreshing(false);
  };

  useEffect(() => { loadData(); }, [profile?.house_id]);

  const xpToNextLevel = (profile?.level ?? 1) * 500;
  const xpProgress = ((profile?.xp ?? 0) % 500) / 500;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hey, {profile?.username} {profile?.avatar_url}</Text>
          <Text style={styles.sub}>Let's keep the house clean today!</Text>
        </View>
        <View style={styles.streakBadge}>
          <Text style={styles.streakText}>🔥 {profile?.streak_days ?? 0}</Text>
        </View>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{profile?.total_credits ?? 0}</Text>
          <Text style={styles.statLabel}>Total Credits</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{todayCount}</Text>
          <Text style={styles.statLabel}>Done Today</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>Lv.{profile?.level ?? 1}</Text>
          <Text style={styles.statLabel}>Level</Text>
        </View>
      </View>

      {/* XP Progress Bar */}
      <View style={styles.xpCard}>
        <View style={styles.xpRow}>
          <Text style={styles.xpLabel}>XP Progress to Level {(profile?.level ?? 1) + 1}</Text>
          <Text style={styles.xpCount}>{(profile?.xp ?? 0) % 500} / 500</Text>
        </View>
        <View style={styles.xpBarBg}>
          <View style={[styles.xpBarFill, { width: `${xpProgress * 100}%` }]} />
        </View>
      </View>

      {/* Quick Log Button */}
      <TouchableOpacity style={styles.quickLogBtn} onPress={() => router.push('/(tabs)/tasks')}>
        <Text style={styles.quickLogText}>+ Log a Chore</Text>
      </TouchableOpacity>

      {/* Mini Leaderboard */}
      <Text style={styles.sectionTitle}>🏆 This Week's Top 3</Text>
      {topMembers.map((member, idx) => (
        <View key={member.id} style={styles.miniLeaderCard}>
          <Text style={styles.rankNum}>{['🥇', '🥈', '🥉'][idx]}</Text>
          <Text style={styles.memberAvatar}>{member.avatar_url}</Text>
          <Text style={styles.memberName}>{member.username}</Text>
          <Text style={styles.memberCredits}>{member.periodCredits} pts</Text>
        </View>
      ))}

      {topMembers.length === 0 && (
        <Text style={styles.emptyText}>No activity yet this week. Be the first! 🚀</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.md, paddingTop: SPACING.xl + 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.lg },
  greeting: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.text },
  sub: { color: COLORS.textSecondary, marginTop: 4 },
  streakBadge: {
    backgroundColor: COLORS.accentLight,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  streakText: { fontWeight: '700', color: COLORS.accent },
  statsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  statCard: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: RADIUS.md,
    padding: SPACING.md, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  statNumber: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.primary },
  statLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
  xpCard: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md,
    marginBottom: SPACING.md, elevation: 2,
  },
  xpRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.xs },
  xpLabel: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontWeight: '600' },
  xpCount: { fontSize: FONTS.sizes.sm, color: COLORS.primary, fontWeight: '700' },
  xpBarBg: { height: 10, backgroundColor: COLORS.border, borderRadius: RADIUS.full, overflow: 'hidden' },
  xpBarFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: RADIUS.full },
  quickLogBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
    paddingVertical: SPACING.md, alignItems: 'center', marginBottom: SPACING.lg,
  },
  quickLogText: { color: '#FFF', fontSize: FONTS.sizes.md, fontWeight: '700' },
  sectionTitle: { fontSize: FONTS.sizes.md, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  miniLeaderCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card,
    borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm,
    gap: SPACING.sm, elevation: 1,
  },
  rankNum: { fontSize: 22, width: 32 },
  memberAvatar: { fontSize: 28 },
  memberName: { flex: 1, fontSize: FONTS.sizes.base, fontWeight: '600', color: COLORS.text },
  memberCredits: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.primary },
  emptyText: { textAlign: 'center', color: COLORS.textSecondary, marginTop: SPACING.md },
});

