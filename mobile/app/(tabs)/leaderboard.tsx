import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { fetchLeaderboard } from '../../lib/api';
import { useAuthStore } from '../../store/useAuthStore';
import { COLORS, FONTS, SPACING, RADIUS, getLevelTitle } from '../../constants/theme';

type Period = 'week' | 'month' | 'all';

export default function LeaderboardScreen() {
  const { profile } = useAuthStore();
  const [period, setPeriod] = useState<Period>('week');
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (p: Period = period) => {
    if (!profile?.house_id) return;
    setLoading(true);
    try {
      const res = await fetchLeaderboard(profile.house_id, p);
      setLeaderboard(res.data.leaderboard);
    } catch (_) {} finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [period]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const RANK_COLORS = [COLORS.gold, COLORS.silver, COLORS.bronze];
  const RANK_EMOJIS = ['🥇', '🥈', '🥉'];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🏆 Leaderboard</Text>

      {/* Period Toggle */}
      <View style={styles.toggle}>
        {(['week', 'month', 'all'] as Period[]).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.toggleBtn, period === p && styles.toggleActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.toggleText, period === p && styles.toggleTextActive]}>
              {p === 'week' ? 'This Week' : p === 'month' ? 'Month' : 'All Time'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={leaderboard}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item, index }) => {
            const isMe = item.id === profile?.id;
            const isTop3 = index < 3;
            return (
              <View style={[styles.card, isMe && styles.cardMe, isTop3 && { borderLeftWidth: 4, borderLeftColor: RANK_COLORS[index] ?? COLORS.primary }]}>
                <Text style={styles.rankLabel}>{isTop3 ? RANK_EMOJIS[index] : `#${item.rank}`}</Text>
                <Text style={styles.avatar}>{item.avatar_url}</Text>
                <View style={styles.info}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name}>{item.username}</Text>
                    {isMe && <Text style={styles.youBadge}>You</Text>}
                  </View>
                  <Text style={styles.levelText}>Lv.{item.level} · {getLevelTitle(item.level)} · 🔥{item.streak_days}</Text>
                  {/* Credits progress bar */}
                  <View style={styles.creditBarBg}>
                    <View
                      style={[
                        styles.creditBarFill,
                        { width: `${Math.min((item.periodCredits / (leaderboard[0]?.periodCredits || 1)) * 100, 100)}%` },
                      ]}
                    />
                  </View>
                </View>
                <Text style={styles.credits}>{item.periodCredits}<Text style={styles.creditsLabel}> pts</Text></Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingTop: SPACING.xl + 16, paddingHorizontal: SPACING.md },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.md },
  toggle: { flexDirection: 'row', backgroundColor: COLORS.border, borderRadius: RADIUS.md, padding: 3, marginBottom: SPACING.md },
  toggleBtn: { flex: 1, paddingVertical: SPACING.xs + 2, borderRadius: RADIUS.sm - 2, alignItems: 'center' },
  toggleActive: { backgroundColor: COLORS.card, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  toggleText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontWeight: '600' },
  toggleTextActive: { color: COLORS.primary },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card,
    borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm,
    elevation: 1, gap: SPACING.sm,
  },
  cardMe: { backgroundColor: '#F0FAF5', borderWidth: 1, borderColor: COLORS.primaryLight },
  rankLabel: { fontSize: 20, width: 36, textAlign: 'center' },
  avatar: { fontSize: 32 },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: 2 },
  name: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  youBadge: {
    backgroundColor: COLORS.primary, color: '#FFF',
    fontSize: FONTS.sizes.xs, fontWeight: '700',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.full,
  },
  levelText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginBottom: 4 },
  creditBarBg: { height: 6, backgroundColor: COLORS.border, borderRadius: RADIUS.full, overflow: 'hidden' },
  creditBarFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: RADIUS.full },
  credits: { fontSize: FONTS.sizes.lg, fontWeight: '800', color: COLORS.primary },
  creditsLabel: { fontSize: FONTS.sizes.xs, fontWeight: '400', color: COLORS.textSecondary },
});

