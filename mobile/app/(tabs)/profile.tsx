import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { fetchAnalytics } from '../../lib/api';
import { useAuthStore } from '../../store/useAuthStore';
import { COLORS, FONTS, SPACING, RADIUS, getLevelTitle } from '../../constants/theme';

const BADGES_MOCK = [
  { id: '1', icon: '🍳', name: 'First Cook', earned: true },
  { id: '2', icon: '🔥', name: '7-Day Streak', earned: false },
  { id: '3', icon: '💪', name: 'Task Master', earned: true },
  { id: '4', icon: '🧹', name: 'Mr. Clean', earned: false },
  { id: '5', icon: '🛒', name: 'Grocery Hero', earned: false },
  { id: '6', icon: '👑', name: 'Weekly Champ', earned: false },
];

export default function ProfileScreen() {
  const { profile, signOut, refreshProfile } = useAuthStore();
  const [analytics, setAnalytics] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadAnalytics = async () => {
    if (!profile?.house_id) return;
    try {
      const res = await fetchAnalytics(profile.house_id);
      setAnalytics(res.data);
    } catch (_) {}
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshProfile(), loadAnalytics()]);
    setRefreshing(false);
  };

  useEffect(() => { loadAnalytics(); }, [profile?.house_id]);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const xpInLevel = (profile?.xp ?? 0) % 500;
  const fairness = analytics?.fairness;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Avatar + Name */}
      <View style={styles.profileHeader}>
        <Text style={styles.avatarLarge}>{profile?.avatar_url}</Text>
        <Text style={styles.username}>{profile?.username}</Text>
        <Text style={styles.levelTitle}>Lv.{profile?.level} — {getLevelTitle(profile?.level ?? 1)}</Text>
        <Text style={styles.phone}>{profile?.phone}</Text>
      </View>

      {/* XP Bar */}
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.cardLabel}>XP Progress</Text>
          <Text style={styles.cardValue}>{xpInLevel} / 500</Text>
        </View>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${(xpInLevel / 500) * 100}%` }]} />
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{profile?.total_credits ?? 0}</Text>
          <Text style={styles.statLbl}>Total Credits</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{profile?.streak_days ?? 0}</Text>
          <Text style={styles.statLbl}>Day Streak 🔥</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{profile?.level ?? 1}</Text>
          <Text style={styles.statLbl}>Level</Text>
        </View>
      </View>

      {/* Fairness Score */}
      {fairness && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>🏡 House Fairness Score</Text>
          <View style={styles.fairnessRow}>
            <Text style={styles.fairnessScore}>{fairness.score}%</Text>
            <Text style={styles.fairnessNote}>
              {fairness.score >= 80 ? '✅ Well balanced!' : fairness.score >= 50 ? '⚠️ Slightly uneven' : '🚨 Very uneven!'}
            </Text>
          </View>
          <View style={styles.barBg}>
            <View style={[styles.barFill, {
              width: `${fairness.score}%`,
              backgroundColor: fairness.score >= 80 ? COLORS.success : fairness.score >= 50 ? COLORS.warning : COLORS.error,
            }]} />
          </View>
        </View>
      )}

      {/* Badges */}
      <Text style={styles.sectionTitle}>🎖️ Badges</Text>
      <View style={styles.badgeGrid}>
        {BADGES_MOCK.map((badge) => (
          <View key={badge.id} style={[styles.badge, !badge.earned && styles.badgeLocked]}>
            <Text style={[styles.badgeIcon, !badge.earned && styles.badgeIconLocked]}>{badge.icon}</Text>
            <Text style={[styles.badgeName, !badge.earned && styles.badgeNameLocked]}>{badge.name}</Text>
          </View>
        ))}
      </View>

      {/* Admin Button */}
      {profile?.is_admin && (
        <TouchableOpacity style={styles.adminBtn} onPress={() => router.push('/house/admin')}>
          <Text style={styles.adminBtnText}>⚙️ Admin Panel</Text>
        </TouchableOpacity>
      )}

      {/* Sign Out */}
      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.md, paddingTop: SPACING.xl + 16, paddingBottom: 40 },
  profileHeader: { alignItems: 'center', marginBottom: SPACING.lg },
  avatarLarge: { fontSize: 72, marginBottom: SPACING.sm },
  username: { fontSize: FONTS.sizes.xxl, fontWeight: '800', color: COLORS.text },
  levelTitle: { color: COLORS.primary, fontWeight: '700', marginTop: 2 },
  phone: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, marginTop: 4 },
  card: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md, elevation: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.xs },
  cardLabel: { fontWeight: '600', color: COLORS.text },
  cardValue: { color: COLORS.primary, fontWeight: '700' },
  barBg: { height: 10, backgroundColor: COLORS.border, borderRadius: RADIUS.full, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: RADIUS.full },
  statsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  statCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center', elevation: 1 },
  statNum: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.primary },
  statLbl: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, textAlign: 'center', marginTop: 2 },
  fairnessRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginVertical: SPACING.xs },
  fairnessScore: { fontSize: FONTS.sizes.xxl, fontWeight: '800', color: COLORS.text },
  fairnessNote: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm },
  sectionTitle: { fontSize: FONTS.sizes.md, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.lg },
  badge: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.sm, alignItems: 'center', width: '30%', elevation: 1 },
  badgeLocked: { opacity: 0.4 },
  badgeIcon: { fontSize: 30 },
  badgeIconLocked: { grayscale: 1 } as any,
  badgeName: { fontSize: FONTS.sizes.xs, color: COLORS.text, textAlign: 'center', marginTop: 4, fontWeight: '600' },
  badgeNameLocked: { color: COLORS.textSecondary },
  adminBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center', marginBottom: SPACING.sm },
  adminBtnText: { color: '#FFF', fontWeight: '700', fontSize: FONTS.sizes.base },
  signOutBtn: { borderWidth: 1, borderColor: COLORS.error, borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center', marginTop: SPACING.sm },
  signOutText: { color: COLORS.error, fontWeight: '700' },
});

