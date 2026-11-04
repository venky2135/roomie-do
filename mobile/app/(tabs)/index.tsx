import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../lib/supabase';
import { fetchLeaderboard } from '../../lib/api';
import { useAuthStore } from '../../store/useAuthStore';
import { COLORS, RADIUS } from '../../constants/theme';
import { fetchActiveLeaves } from '../../lib/leaveWorkflow';
import { isLogApproved } from '../../lib/taskWorkflow';
import { fetchWeeklyStakes, saveWeeklyStakes, WeeklyStakes } from '../../lib/stakesWorkflow';

type Period = 'week' | 'month' | 'all';

interface LeaderboardMember {
  id: string;
  username: string;
  avatar_url: string;
  periodCredits: number;
  total_credits: number;
  streak_days: number;
  rank: number;
}

export default function HomeScreen() {
  const { profile, refreshProfile } = useAuthStore();
  const [leaderboard, setLeaderboard] = useState<LeaderboardMember[]>([]);
  const [onLeaveUserIds, setOnLeaveUserIds] = useState<string[]>([]);
  const [period, setPeriod] = useState<Period>('week');
  const [todayCount, setTodayCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [weeklyStakes, setWeeklyStakes] = useState<WeeklyStakes>({
    bounty: 'Winner gets treated to weekend takeout dinner by housemates 🍕',
    penalty: 'Loser does the weekend kitchen deep clean & takes out the trash 🧹',
  });
  const [editingStakes, setEditingStakes] = useState(false);
  const [bountyInput, setBountyInput] = useState('');
  const [penaltyInput, setPenaltyInput] = useState('');
  const [savingStakes, setSavingStakes] = useState(false);

  const loadData = useCallback(async (p: Period = period) => {
    if (!profile?.house_id) return;

    // Load active approved leaves for house
    try {
      const leaves = await fetchActiveLeaves(profile.house_id);
      setOnLeaveUserIds(leaves);
    } catch (_) {}

    // Load weekly stakes (bounty & penalty)
    try {
      const stakes = await fetchWeeklyStakes(profile.house_id);
      setWeeklyStakes(stakes);
      setBountyInput(stakes.bounty);
      setPenaltyInput(stakes.penalty);
    } catch (_) {}

    // Today's completed tasks by current user (approved only)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data: todayLogs } = await supabase
      .from('task_logs')
      .select('notes')
      .eq('user_id', profile.id)
      .gte('completed_at', today.toISOString());
    const count = todayLogs?.filter((l) => isLogApproved(l.notes)).length ?? 0;
    setTodayCount(count);

    // Leaderboard with backend + direct Supabase fallback
    try {
      const res = await fetchLeaderboard(profile.house_id, p);
      if (res.data?.leaderboard && res.data.leaderboard.length > 0) {
        setLeaderboard(res.data.leaderboard);
        return;
      }
    } catch (_) {}

    // Fallback: Query Supabase directly
    try {
      const { data: members } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, total_credits, xp, streak_days')
        .eq('house_id', profile.house_id);

      if (!members || members.length === 0) {
        setLeaderboard([]);
        return;
      }

      if (p === 'all') {
        const sorted = [...members].sort((a, b) => (b.xp || b.total_credits || 0) - (a.xp || a.total_credits || 0));
        setLeaderboard(
          sorted.map((m, i) => ({
            ...m,
            rank: i + 1,
            periodCredits: m.xp || m.total_credits || 0,
          }))
        );
      } else {
        const days = p === 'week' ? 7 : 30;
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - days);

        const memberIds = members.map((m) => m.id);
        const { data: logs } = await supabase
          .from('task_logs')
          .select('user_id, credits_awarded, notes')
          .in('user_id', memberIds)
          .gte('completed_at', sinceDate.toISOString());

        const creditMap: Record<string, number> = {};
        members.forEach((m) => (creditMap[m.id] = 0));
        logs?.forEach((l) => {
          if (isLogApproved(l.notes)) {
            creditMap[l.user_id] = (creditMap[l.user_id] || 0) + (l.credits_awarded || 0);
          }
        });

        const sorted = members
          .map((m) => ({
            ...m,
            periodCredits: creditMap[m.id] || 0,
          }))
          .sort((a, b) => b.periodCredits - a.periodCredits)
          .map((m, i) => ({ ...m, rank: i + 1 }));

        setLeaderboard(sorted);
      }
    } catch (_) {}
  }, [profile?.house_id, profile?.id, period]);

  useEffect(() => {
    loadData(period);
    if (!profile?.house_id) return;

    const channel = supabase
      .channel('home-feed-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_logs' }, () => {
        loadData(period);
        refreshProfile();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.house_id, period, loadData, refreshProfile]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadData(period), refreshProfile()]);
    setRefreshing(false);
  };

  const openEditStakes = () => {
    setBountyInput(weeklyStakes.bounty);
    setPenaltyInput(weeklyStakes.penalty);
    setEditingStakes(true);
  };

  const handleSaveStakes = async () => {
    if (!profile?.house_id || !profile?.id) return;
    if (!bountyInput.trim()) {
      if (Platform.OS === 'web') alert('Please enter the bounty for the winner');
      else Alert.alert('Required', 'Please enter the bounty for the winner');
      return;
    }
    if (!penaltyInput.trim()) {
      if (Platform.OS === 'web') alert('Please enter the penalty for the loser');
      else Alert.alert('Required', 'Please enter the penalty for the loser');
      return;
    }

    setSavingStakes(true);
    const res = await saveWeeklyStakes({
      houseId: profile.house_id,
      bounty: bountyInput.trim(),
      penalty: penaltyInput.trim(),
      userId: profile.id,
    });
    setSavingStakes(false);

    if (res.success && res.stakes) {
      setWeeklyStakes(res.stakes);
      setEditingStakes(false);
      const msg = 'Weekly bounty & penalty updated successfully!';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Updated! 🏆', msg);
    } else {
      const err = res.error || 'Failed to update weekly stakes';
      if (Platform.OS === 'web') alert(err);
      else Alert.alert('Error', err);
    }
  };

  const topper = leaderboard[0];
  const maxCredits = Math.max(...leaderboard.map((m) => m.periodCredits), 20);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Minimal Top Header */}
      <View style={styles.header}>
        <View style={styles.userBox}>
          <Text style={styles.avatarMini}>{profile?.avatar_url || '🧑'}</Text>
          <View>
            <Text style={styles.greetingText}>Hey, {profile?.username}</Text>
            <Text style={styles.subText}>House Chore Hub</Text>
          </View>
        </View>
        <View style={styles.streakBadge}>
          <Ionicons name="flame" size={12} color={COLORS.accent} />
          <Text style={styles.streakText}>{profile?.streak_days ?? 0}d streak</Text>
        </View>
      </View>

      {/* Weekend Topper Card */}
      {topper && (
        <View style={styles.topperPill}>
          <Ionicons name="trophy" size={14} color="#FFD700" />
          <Text style={styles.topperText}>
            Weekend Leader: <Text style={styles.topperBold}>{topper.username}</Text> ({topper.periodCredits} XP)
          </Text>
          {topper.id === profile?.id && (
            <View style={styles.leadTag}>
              <Text style={styles.leadTagText}>You</Text>
            </View>
          )}
        </View>
      )}

      {/* Horizontal Progress / Race Bar with Avatars on Top */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.iconTitleRow}>
            <Ionicons name="flag-outline" size={14} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>Weekly XP Progress</Text>
          </View>
          <Text style={styles.sectionCaption}>Avatars on track</Text>
        </View>

        {/* Track with Avatars on Top */}
        <View style={styles.raceTrackWrapper}>
          {/* Runner Avatars positioned along the horizontal bar */}
          <View style={styles.runnersOverlay}>
            {leaderboard.map((member, idx) => {
              const pct = maxCredits > 0 ? Math.min((member.periodCredits / maxCredits) * 100, 90) : 0;
              const isLead = idx === 0 && member.periodCredits > 0;
              return (
                <View
                  key={member.id}
                  style={[
                    styles.runnerCol,
                    { left: `${Math.max(pct, 2)}%` },
                  ]}
                >
                  {isLead && (
                    <Ionicons name="ribbon" size={11} color="#FFD700" style={{ marginBottom: -2 }} />
                  )}
                  <View style={[styles.runnerBubble, member.id === profile?.id && styles.runnerBubbleMe]}>
                    <Text style={styles.runnerBubbleText}>{member.avatar_url || '🧑'}</Text>
                  </View>
                  <Text style={styles.runnerName} numberOfLines={1}>
                    {member.id === profile?.id ? 'You' : member.username}
                  </Text>
                  <Text style={styles.runnerPts}>{member.periodCredits}xp</Text>
                </View>
              );
            })}
          </View>

          {/* Horizontal Bar */}
          <View style={styles.horizontalBarBg}>
            <View
              style={[
                styles.horizontalBarFill,
                { width: `${Math.min((topper?.periodCredits || 0) / maxCredits * 100, 100)}%` },
              ]}
            />
          </View>

          <View style={styles.barMarkers}>
            <Text style={styles.markerText}>0</Text>
            <Text style={styles.markerText}>{Math.round(maxCredits / 2)}</Text>
            <Text style={styles.markerText}>{maxCredits} XP Target</Text>
          </View>
        </View>
      </View>

      {/* Stats Quick Row (Minimal, Small Text) */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Your XP</Text>
          <Text style={styles.statValue}>{profile?.xp ?? 0}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Done Today</Text>
          <Text style={styles.statValue}>{todayCount}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Housemates</Text>
          <Text style={styles.statValue}>{leaderboard.length}</Text>
        </View>
      </View>

      {/* Single Minimal Action: Log a Chore (Marketplace button removed) */}
      <TouchableOpacity style={styles.logBtn} onPress={() => router.push('/(tabs)/tasks')}>
        <Ionicons name="add" size={16} color="#FFF" />
        <Text style={styles.logBtnText}>Log Completed Chore</Text>
      </TouchableOpacity>

      {/* ─── Vertical Graph Type Rankings (Week, Month, All-Time) ─── */}
      <View style={styles.graphCard}>
        {/* Graph Header & Period Toggles */}
        <View style={styles.graphHeader}>
          <View style={styles.iconTitleRow}>
            <Ionicons name="bar-chart-outline" size={14} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>Vertical Ranking Graph</Text>
          </View>

          <View style={styles.periodPillGroup}>
            {(['week', 'month', 'all'] as Period[]).map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.periodTab, period === p && styles.periodTabActive]}
                onPress={() => setPeriod(p)}
              >
                <Text style={[styles.periodTabText, period === p && styles.periodTabTextActive]}>
                  {p === 'week' ? 'Week' : p === 'month' ? 'Month' : 'All-Time'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {leaderboard.length === 0 ? (
          <View style={styles.chartEmpty}>
            <Text style={styles.chartEmptyText}>No rankings recorded for this {period === 'all' ? 'period' : period}.</Text>
          </View>
        ) : (
          <>
          {/* Vertical Column Bar Chart */}
          <View style={styles.chartWrapper}>
          {/* Background Grid Guidelines */}
          <View style={styles.chartGuides}>
            <View style={styles.guideLineRow}>
              <Text style={styles.guideLabel}>{maxCredits}xp</Text>
              <View style={styles.guideLine} />
            </View>
            <View style={styles.guideLineRow}>
              <Text style={styles.guideLabel}>{Math.round(maxCredits / 2)}xp</Text>
              <View style={styles.guideLine} />
            </View>
            <View style={styles.guideLineRow}>
              <Text style={styles.guideLabel}>0xp</Text>
              <View style={styles.guideLine} />
            </View>
          </View>

          {/* Vertical Columns */}
          <View style={styles.columnsRow}>
            {leaderboard.map((member, idx) => {
              const heightPct = maxCredits > 0 ? Math.max((member.periodCredits / maxCredits) * 100, 8) : 8;
              const isTop = idx === 0 && member.periodCredits > 0;
              const isMe = member.id === profile?.id;
              const isOnLeave = onLeaveUserIds.includes(member.id);

              return (
                <View key={member.id} style={styles.columnItem}>
                  {/* XP Value at Top of Bar */}
                  <Text style={[styles.barValueText, isTop && styles.barValueTop, isOnLeave && styles.barValueOnLeave]}>
                    {member.periodCredits}
                  </Text>

                  {/* Vertical Bar Container */}
                  <View style={styles.barVerticalTrack}>
                    <View
                      style={[
                        styles.barVerticalFill,
                        { height: `${heightPct}%` },
                        isOnLeave
                          ? styles.barFillOnLeave
                          : isTop
                          ? styles.barFillTop
                          : isMe
                          ? styles.barFillMe
                          : styles.barFillOther,
                      ]}
                    />
                  </View>

                  {/* Avatar & Label Below Bar */}
                  <View style={styles.columnFooter}>
                    <Text style={[styles.footerAvatar, isOnLeave && { opacity: 0.6 }]}>{member.avatar_url || '🧑'}</Text>
                    <Text style={[styles.footerName, isMe && styles.footerNameMe, isOnLeave && styles.footerNameOnLeave]} numberOfLines={1}>
                      {isMe ? 'You' : member.username}
                    </Text>
                    <Text style={styles.footerRank}>#{idx + 1}</Text>
                    {isOnLeave && (
                      <View style={styles.columnLeaveBadge}>
                        <Text style={styles.columnLeaveText}>Leave</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Minimal Leaderboard Table Summary */}
        <View style={styles.rankList}>
          {leaderboard.map((member, idx) => {
            const isOnLeave = onLeaveUserIds.includes(member.id);

            return (
              <View key={member.id} style={[styles.rankRow, isOnLeave && styles.rankRowOnLeave]}>
                <Text style={[styles.rankIndex, isOnLeave && { color: '#94A3B8' }]}>#{idx + 1}</Text>
                <Text style={[styles.rankAvatar, isOnLeave && { opacity: 0.6 }]}>{member.avatar_url || '🧑'}</Text>
                <View style={styles.rankNameCol}>
                  <Text style={[styles.rankUsername, member.id === profile?.id && styles.rankUsernameMe, isOnLeave && styles.rankUsernameOnLeave]}>
                    {member.username} {member.id === profile?.id ? '(You)' : ''}
                  </Text>
                  {isOnLeave && (
                    <View style={styles.tableLeaveTag}>
                      <Ionicons name="airplane" size={9} color="#64748B" />
                      <Text style={styles.tableLeaveText}>On Leave</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.rankPoints, isOnLeave && styles.rankPointsOnLeave]}>{member.periodCredits} XP</Text>
              </View>
            );
          })}
        </View>
        </>
        )}
      </View>

      {/* ─── Weekly Bounty & Penalty Section ─── */}
      <View style={styles.stakesCard}>
        <View style={styles.stakesHeaderRow}>
          <View style={styles.stakesHeaderLeft}>
            <View style={styles.stakesIconBadge}>
              <Ionicons name="gift" size={15} color="#D97706" />
            </View>
            <View>
              <Text style={styles.stakesSectionTitle}>Weekly Bounty & Penalty</Text>
              <Text style={styles.stakesSectionSub}>House stakes for 1st place & last place</Text>
            </View>
          </View>
          {profile?.is_admin && (
            <TouchableOpacity style={styles.stakesEditBtn} onPress={openEditStakes}>
              <Ionicons name="create-outline" size={12} color={COLORS.primary} />
              <Text style={styles.stakesEditBtnText}>Edit Stakes</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 🏆 Winner Bounty Card */}
        <View style={styles.bountyBox}>
          <View style={styles.stakesBadgeHeader}>
            <View style={styles.bountyTag}>
              <Ionicons name="trophy" size={11} color="#15803D" />
              <Text style={styles.bountyTagText}>WINNER BOUNTY</Text>
            </View>
            <Text style={styles.stakesTargetLabel}>#1 Housemate Prize</Text>
          </View>
          <Text style={styles.stakesText}>{weeklyStakes.bounty}</Text>
        </View>

        {/* ⚠️ Loser Penalty Card */}
        <View style={styles.penaltyBox}>
          <View style={styles.stakesBadgeHeader}>
            <View style={styles.penaltyTag}>
              <Ionicons name="alert-circle" size={11} color="#DC2626" />
              <Text style={styles.penaltyTagText}>LOSER PENALTY</Text>
            </View>
            <Text style={styles.stakesTargetLabel}>Last Place Price</Text>
          </View>
          <Text style={styles.stakesText}>{weeklyStakes.penalty}</Text>
        </View>

        {!profile?.is_admin && (
          <Text style={styles.stakesFooterNote}>
            💡 Staked weekly by house admin. Top the leaderboard to claim the bounty!
          </Text>
        )}
      </View>

      {/* Modal: Edit Weekly Bounty & Penalty (Admin Only) */}
      <Modal visible={editingStakes} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="trophy" size={20} color="#D97706" />
                <Text style={styles.modalTitle}>Update Weekly Stakes</Text>
              </View>
              <TouchableOpacity onPress={() => setEditingStakes(false)}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>
              Set the price for the winner (bounty) and the price for the loser (penalty) this week.
            </Text>

            {/* Winner Bounty Input */}
            <View style={styles.modalInputGroup}>
              <View style={styles.inputLabelRow}>
                <Ionicons name="gift" size={13} color="#15803D" />
                <Text style={styles.inputLabel}>Winner Bounty (Price for the Winner)</Text>
              </View>
              <TextInput
                style={styles.modalTextInput}
                value={bountyInput}
                onChangeText={setBountyInput}
                placeholder="e.g. Winner gets treated to takeout dinner by roommates 🍕"
                placeholderTextColor={COLORS.textLight}
                multiline
                numberOfLines={2}
              />
              <View style={styles.suggestionRow}>
                {['🍕 Free Dinner', '☕ Free Coffee (1 Wk)', '👑 Chore Pass (3d)'].map((sug) => (
                  <TouchableOpacity
                    key={sug}
                    style={styles.suggestionPill}
                    onPress={() => setBountyInput(sug)}
                  >
                    <Text style={styles.suggestionText}>{sug}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Loser Penalty Input */}
            <View style={styles.modalInputGroup}>
              <View style={styles.inputLabelRow}>
                <Ionicons name="alert-circle" size={13} color="#DC2626" />
                <Text style={styles.inputLabel}>Loser Penalty (Price for the Loser)</Text>
              </View>
              <TextInput
                style={styles.modalTextInput}
                value={penaltyInput}
                onChangeText={setPenaltyInput}
                placeholder="e.g. Loser must wash dishes and deep clean kitchen on Sunday 🧽"
                placeholderTextColor={COLORS.textLight}
                multiline
                numberOfLines={2}
              />
              <View style={styles.suggestionRow}>
                {['🧹 Sunday Deep Clean', '🗑️ Trash Duty (2 Wks)', '🍳 Cook Breakfast'].map((sug) => (
                  <TouchableOpacity
                    key={sug}
                    style={styles.suggestionPill}
                    onPress={() => setPenaltyInput(sug)}
                  >
                    <Text style={styles.suggestionText}>{sug}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.saveStakesBtn, savingStakes && { opacity: 0.6 }]}
              onPress={handleSaveStakes}
              disabled={savingStakes}
            >
              {savingStakes ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                  <Text style={styles.saveStakesBtnText}>Save Bounty & Penalty</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 12, paddingTop: 44, paddingBottom: 36 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  userBox: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatarMini: { fontSize: 24 },
  greetingText: { fontSize: 15, fontWeight: '700', color: '#1A1A24' },
  subText: { fontSize: 11, color: '#7E7E8F' },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF4E5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    gap: 3,
  },
  streakText: { fontSize: 11, fontWeight: '700', color: COLORS.accent },
  topperPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFDE7',
    borderWidth: 1,
    borderColor: '#FFF59D',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
    gap: 6,
  },
  topperText: { fontSize: 11, color: '#5D4037', flex: 1 },
  topperBold: { fontWeight: '700', color: '#1A1A24' },
  leadTag: {
    backgroundColor: '#FBC02D',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: RADIUS.full,
  },
  leadTagText: { fontSize: 9, fontWeight: '800', color: '#FFF' },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.sm,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ECECEC',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  iconTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#1A1A24' },
  sectionCaption: { fontSize: 10, color: '#9090A0' },
  raceTrackWrapper: { paddingTop: 46, paddingBottom: 2 },
  runnersOverlay: { position: 'absolute', top: 0, left: 0, right: 0, height: 46 },
  runnerCol: { position: 'absolute', alignItems: 'center', marginLeft: -18, width: 36 },
  runnerBubble: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F0F0EE',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runnerBubbleMe: { borderColor: COLORS.accent, backgroundColor: '#FFF3E0' },
  runnerBubbleText: { fontSize: 12 },
  runnerName: { fontSize: 8, fontWeight: '600', color: '#1A1A24', marginTop: 1 },
  runnerPts: { fontSize: 8, fontWeight: '700', color: COLORS.primary },
  horizontalBarBg: { height: 8, backgroundColor: '#EFEFEF', borderRadius: RADIUS.full, overflow: 'hidden' },
  horizontalBarFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: RADIUS.full },
  barMarkers: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  markerText: { fontSize: 9, color: '#A0A0B0', fontWeight: '500' },
  statsRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.sm,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#ECECEC',
  },
  statLabel: { fontSize: 10, color: '#7E7E8F', fontWeight: '500' },
  statValue: { fontSize: 16, fontWeight: '800', color: COLORS.primary, marginTop: 1 },
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingVertical: 10,
    marginBottom: 10,
    gap: 4,
  },
  logBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  graphCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ECECEC',
    marginBottom: 12,
  },
  graphHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  periodPillGroup: {
    flexDirection: 'row',
    backgroundColor: '#EFEFEF',
    borderRadius: RADIUS.full,
    padding: 2,
  },
  periodTab: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.full },
  periodTabActive: { backgroundColor: '#FFFFFF' },
  periodTabText: { fontSize: 10, color: '#7E7E8F', fontWeight: '600' },
  periodTabTextActive: { color: COLORS.primary, fontWeight: '700' },
  chartWrapper: { height: 160, position: 'relative', marginVertical: 6 },
  chartGuides: {
    position: 'absolute',
    top: 14,
    left: 0,
    right: 0,
    bottom: 34,
    justifyContent: 'space-between',
  },
  guideLineRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  guideLabel: { width: 34, fontSize: 8, color: '#A5A5B5', textAlign: 'right', fontWeight: '500' },
  guideLine: { flex: 1, height: 1, backgroundColor: '#F0F0F2' },
  columnsRow: {
    position: 'absolute',
    top: 0,
    left: 42,
    right: 8,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
  },
  columnItem: { alignItems: 'center', width: 44 },
  barValueText: { fontSize: 9, fontWeight: '700', color: '#7E7E8F', marginBottom: 2 },
  barValueTop: { color: COLORS.primary, fontWeight: '800' },
  barVerticalTrack: {
    width: 22,
    height: 95,
    backgroundColor: '#F3F4F6',
    borderRadius: 5,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barVerticalFill: { width: '100%', borderRadius: 5 },
  barFillTop: { backgroundColor: COLORS.primary },
  barFillMe: { backgroundColor: '#81C784' },
  barFillOther: { backgroundColor: '#B0BEC5' },
  columnFooter: { alignItems: 'center', marginTop: 4, height: 32 },
  footerAvatar: { fontSize: 12 },
  footerName: { fontSize: 8, fontWeight: '600', color: '#1A1A24', maxWidth: 40 },
  footerNameMe: { color: COLORS.primary, fontWeight: '700' },
  footerRank: { fontSize: 7, color: '#9E9E9E', fontWeight: '700' },
  rankList: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 6 },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  rankIndex: { fontSize: 10, fontWeight: '700', color: '#9090A0', width: 18 },
  rankAvatar: { fontSize: 14 },
  rankUsername: { fontSize: 11, color: '#1A1A24' },
  rankUsernameMe: { fontWeight: '700', color: COLORS.primary },
  rankPoints: { fontSize: 11, fontWeight: '700', color: '#1A1A24' },
  chartEmpty: { paddingVertical: 24, alignItems: 'center', justifyContent: 'center' },
  chartEmptyText: { fontSize: 11, color: '#9090A0', fontStyle: 'italic' },
  barFillOnLeave: { backgroundColor: '#94A3B8' },
  barValueOnLeave: { color: '#94A3B8' },
  footerNameOnLeave: { color: '#64748B' },
  columnLeaveBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 3,
    marginTop: 1,
  },
  columnLeaveText: { fontSize: 6, fontWeight: '800', color: '#64748B' },
  rankRowOnLeave: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingHorizontal: 6,
    marginVertical: 1,
  },
  rankNameCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  rankUsernameOnLeave: { color: '#64748B' },
  rankPointsOnLeave: { color: '#64748B' },
  tableLeaveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: RADIUS.full,
    gap: 2,
  },
  tableLeaveText: { fontSize: 8, fontWeight: '700', color: '#475569' },
  // Weekly Bounty & Penalty Styles
  stakesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ECECEC',
    marginBottom: 16,
  },
  stakesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  stakesHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  stakesIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stakesSectionTitle: { fontSize: 13, fontWeight: '700', color: '#1A1A24' },
  stakesSectionSub: { fontSize: 9, color: '#7E7E8F', marginTop: 1 },
  stakesEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    gap: 3,
  },
  stakesEditBtnText: { fontSize: 9, fontWeight: '700', color: COLORS.primary },
  bountyBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: RADIUS.sm,
    padding: 9,
    marginBottom: 8,
  },
  penaltyBox: {
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: RADIUS.sm,
    padding: 9,
    marginBottom: 4,
  },
  stakesBadgeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  bountyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  bountyTagText: { fontSize: 8, fontWeight: '800', color: '#15803D', letterSpacing: 0.3 },
  penaltyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  penaltyTagText: { fontSize: 8, fontWeight: '800', color: '#DC2626', letterSpacing: 0.3 },
  stakesTargetLabel: { fontSize: 8, color: '#64748B', fontWeight: '600' },
  stakesText: { fontSize: 11, fontWeight: '600', color: '#1E293B', lineHeight: 16 },
  stakesFooterNote: { fontSize: 8, color: '#94A3B8', marginTop: 4, fontStyle: 'italic', textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modalTitle: { fontSize: 15, fontWeight: '800', color: '#1A1A24' },
  modalSub: { fontSize: 10, color: '#7E7E8F', marginBottom: 12, lineHeight: 14 },
  modalInputGroup: { marginBottom: 12 },
  inputLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  inputLabel: { fontSize: 10, fontWeight: '700', color: '#1E293B' },
  modalTextInput: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    padding: 8,
    fontSize: 11,
    color: '#1A1A24',
    minHeight: 46,
    textAlignVertical: 'top',
  },
  suggestionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  suggestionPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  suggestionText: { fontSize: 9, color: '#475569', fontWeight: '600' },
  saveStakesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingVertical: 11,
    marginTop: 4,
    marginBottom: 16,
    gap: 6,
  },
  saveStakesBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
});
