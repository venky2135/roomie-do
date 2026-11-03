import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const BADGES_LIST = [
  { id: '1', icon: 'restaurant-outline' as const, name: 'First Cook', earned: true },
  { id: '2', icon: 'flame-outline' as const, name: '7-Day Streak', earned: false },
  { id: '3', icon: 'checkmark-circle-outline' as const, name: 'Chore Master', earned: true },
  { id: '4', icon: 'sparkles-outline' as const, name: 'Super Cleaner', earned: false },
  { id: '5', icon: 'cart-outline' as const, name: 'Marketplace Hero', earned: true },
  { id: '6', icon: 'trophy-outline' as const, name: 'Weekend Champ', earned: false },
];

export default function ProfileScreen() {
  const { profile, signOut, refreshProfile } = useAuthStore();
  const [completedCount, setCompletedCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = async () => {
    if (!profile?.id) return;
    try {
      const { count } = await supabase
        .from('task_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id);
      setCompletedCount(count ?? 0);
    } catch (_) {}
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshProfile(), loadStats()]);
    setRefreshing(false);
  };

  useEffect(() => {
    loadStats();
  }, [profile?.id]);

  const handleSignOut = async () => {
    const performSignOut = async () => {
      try {
        await signOut();
        router.replace('/(auth)/login');
      } catch (err) {
        console.warn('Sign out error', err);
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' ? window.confirm('Are you sure you want to sign out?') : true;
      if (confirmed) {
        await performSignOut();
      }
    } else {
      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: performSignOut },
      ]);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarLarge}>{profile?.avatar_url || '🧑'}</Text>
        </View>
        <Text style={styles.username}>{profile?.username}</Text>
        <Text style={styles.phone}>{profile?.phone || 'Roommate'}</Text>
        <View style={styles.xpPill}>
          <Ionicons name="flash" size={14} color="#FFF" />
          <Text style={styles.xpPillText}>{profile?.xp ?? 0} Total XP Points</Text>
        </View>
      </View>

      {/* Simplified Stats (Clean XP & Chores, No Levels) */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Ionicons name="flash-outline" size={22} color={COLORS.primary} />
          <Text style={styles.statNum}>{profile?.xp ?? 0}</Text>
          <Text style={styles.statLbl}>Total XP</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="flame-outline" size={22} color={COLORS.accent} />
          <Text style={[styles.statNum, { color: COLORS.accent }]}>{profile?.streak_days ?? 0}</Text>
          <Text style={styles.statLbl}>Day Streak</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="checkbox-outline" size={22} color={COLORS.primary} />
          <Text style={styles.statNum}>{completedCount}</Text>
          <Text style={styles.statLbl}>Chores Done</Text>
        </View>
      </View>

      {/* Badges Section with Native Icons */}
      <View style={styles.sectionHeaderRow}>
        <Ionicons name="ribbon-outline" size={20} color={COLORS.text} />
        <Text style={styles.sectionTitle}>Household Badges</Text>
      </View>
      <View style={styles.badgeGrid}>
        {BADGES_LIST.map((badge) => (
          <View key={badge.id} style={[styles.badge, !badge.earned && styles.badgeLocked]}>
            <View style={[styles.badgeIconBox, !badge.earned && styles.badgeIconBoxLocked]}>
              <Ionicons
                name={badge.icon}
                size={22}
                color={badge.earned ? COLORS.primary : COLORS.textLight}
              />
            </View>
            <Text style={[styles.badgeName, !badge.earned && styles.badgeNameLocked]}>{badge.name}</Text>
            {badge.earned ? (
              <View style={styles.earnedDot} />
            ) : (
              <Text style={styles.lockedText}>Locked</Text>
            )}
          </View>
        ))}
      </View>

      {/* Admin Panel Button */}
      {profile?.is_admin && (
        <TouchableOpacity style={styles.adminBtn} onPress={() => router.push('/house/admin')}>
          <Ionicons name="settings-outline" size={18} color="#FFF" />
          <Text style={styles.adminBtnText}>Admin Settings</Text>
        </TouchableOpacity>
      )}

      {/* Sign Out */}
      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={18} color={COLORS.error} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 12, paddingTop: 44, paddingBottom: 36 },
  profileHeader: { alignItems: 'center', marginBottom: 12 },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    borderWidth: 1.5,
    borderColor: COLORS.primaryLight,
  },
  avatarLarge: { fontSize: 30 },
  username: { fontSize: 15, fontWeight: '800', color: '#1A1A24' },
  phone: { fontSize: 10, color: '#7E7E8F', marginTop: 1 },
  xpPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    gap: 4,
    marginTop: 6,
  },
  xpPillText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.sm,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ECECEC',
  },
  statNum: { fontSize: 15, fontWeight: '800', color: COLORS.primary, marginTop: 2 },
  statLbl: { fontSize: 9, color: '#7E7E8F', marginTop: 1, fontWeight: '600' },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#1A1A24' },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  badge: {
    width: '31%',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.sm,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ECECEC',
  },
  badgeLocked: { opacity: 0.5, backgroundColor: '#FAFAFA' },
  badgeIconBox: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.full,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  badgeIconBoxLocked: { backgroundColor: '#EEEEEE' },
  badgeName: { fontSize: 10, fontWeight: '600', color: '#1A1A24', textAlign: 'center', marginBottom: 2 },
  badgeNameLocked: { color: '#A0A0B0' },
  earnedDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLORS.success },
  lockedText: { fontSize: 8, color: '#A0A0B0', fontWeight: '500' },
  adminBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#37474F',
    borderRadius: RADIUS.sm,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 6,
  },
  adminBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.sm,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#FFCDD2',
    gap: 4,
  },
  signOutText: { color: COLORS.error, fontSize: 12, fontWeight: '700' },
});
