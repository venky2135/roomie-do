import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { sendNudge } from '../../lib/api';
import { useAuthStore } from '../../store/useAuthStore';
import { useHouseStore } from '../../store/useHouseStore';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

interface FeedItem {
  id: string;
  user_id: string;
  completed_at: string;
  credits_awarded: number;
  notes: string | null;
  profiles: { username: string; avatar_url: string };
  task_templates: { name: string; icon: string };
}

const REACTION_EMOJIS = ['👏', '🔥', '💪', '😄'];

export default function FeedScreen() {
  const { profile } = useAuthStore();
  const { members } = useHouseStore();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [reactions, setReactions] = useState<Record<string, string[]>>({});

  const loadFeed = useCallback(async () => {
    if (!profile?.house_id) return;
    const memberIds = (await supabase
      .from('profiles')
      .select('id')
      .eq('house_id', profile.house_id)
    ).data?.map((m) => m.id) ?? [];

    const { data } = await supabase
      .from('task_logs')
      .select('*, profiles(username, avatar_url), task_templates(name, icon)')
      .in('user_id', memberIds)
      .order('completed_at', { ascending: false })
      .limit(50);

    setFeed((data as FeedItem[]) ?? []);
  }, [profile?.house_id]);

  // Supabase Realtime subscription
  useEffect(() => {
    loadFeed();
    if (!profile?.house_id) return;

    const channel = supabase
      .channel('feed-channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'task_logs' }, () => {
        loadFeed();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.house_id]);

  const onRefresh = async () => { setRefreshing(true); await loadFeed(); setRefreshing(false); };

  const handleReaction = (logId: string, emoji: string) => {
    setReactions((prev) => ({
      ...prev,
      [logId]: [...(prev[logId] ?? []), emoji],
    }));
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📰 Activity Feed</Text>
      <FlatList
        data={feed}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No activity yet. Go log a chore! 🧹</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.avatar}>{item.profiles?.avatar_url}</Text>
              <View style={styles.headerInfo}>
                <Text style={styles.username}>{item.profiles?.username}</Text>
                <Text style={styles.time}>{timeAgo(item.completed_at)}</Text>
              </View>
              <View style={styles.creditsPill}>
                <Text style={styles.creditsText}>+{item.credits_awarded} pts</Text>
              </View>
            </View>

            <View style={styles.taskRow}>
              <Text style={styles.taskIcon}>{item.task_templates?.icon}</Text>
              <Text style={styles.taskName}>{item.task_templates?.name}</Text>
            </View>

            {item.notes ? <Text style={styles.notes}>💬 {item.notes}</Text> : null}

            {/* Reactions */}
            <View style={styles.reactionsRow}>
              {REACTION_EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.reactionBtn}
                  onPress={() => handleReaction(item.id, emoji)}
                >
                  <Text>{emoji}</Text>
                  {reactions[item.id]?.filter((r) => r === emoji).length > 0 && (
                    <Text style={styles.reactionCount}>
                      {reactions[item.id].filter((r) => r === emoji).length}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}

              {/* Nudge button (only for other members) */}
              {item.user_id !== profile?.id && (
                <TouchableOpacity
                  style={styles.nudgeBtn}
                  onPress={() => sendNudge(item.user_id).catch(() => {})}
                >
                  <Text style={styles.nudgeText}>👋 Nudge</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingTop: SPACING.xl + 16, paddingHorizontal: SPACING.md },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.md },
  card: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.sm, elevation: 1,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm, gap: SPACING.sm },
  avatar: { fontSize: 32 },
  headerInfo: { flex: 1 },
  username: { fontWeight: '700', color: COLORS.text, fontSize: FONTS.sizes.base },
  time: { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs },
  creditsPill: { backgroundColor: COLORS.primaryLight, paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: RADIUS.full },
  creditsText: { color: COLORS.primaryDark, fontWeight: '700', fontSize: FONTS.sizes.sm },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs },
  taskIcon: { fontSize: 22 },
  taskName: { fontSize: FONTS.sizes.base, fontWeight: '600', color: COLORS.text },
  notes: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, marginBottom: SPACING.sm, fontStyle: 'italic' },
  reactionsRow: { flexDirection: 'row', gap: SPACING.xs, flexWrap: 'wrap', marginTop: SPACING.xs },
  reactionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: COLORS.background, paddingHorizontal: SPACING.sm,
    paddingVertical: 4, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border,
  },
  reactionCount: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  nudgeBtn: {
    marginLeft: 'auto', backgroundColor: COLORS.accentLight,
    paddingHorizontal: SPACING.sm, paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  nudgeText: { color: COLORS.accent, fontWeight: '700', fontSize: FONTS.sizes.xs },
  emptyText: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 40 },
});

