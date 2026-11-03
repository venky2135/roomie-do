import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Image,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../lib/supabase';
import { sendNudge } from '../../lib/api';
import { useAuthStore } from '../../store/useAuthStore';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import AppIcon from '../../components/AppIcon';
import {
  parseLogNotes,
  verifyTaskLog,
  addAnonymousFeedback,
  TaskLogMetadata,
} from '../../lib/taskWorkflow';

interface FeedItem {
  id: string;
  user_id: string;
  completed_at: string;
  credits_awarded: number;
  photo_url: string | null;
  notes: string | null;
  profiles: { username: string; avatar_url: string };
  task_templates: { name: string; icon: string; category?: string };
}

export default function FeedScreen() {
  const { profile } = useAuthStore();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [reactions, setReactions] = useState<Record<string, string[]>>({});

  // Anonymous Feedback Modal State
  const [feedbackLogId, setFeedbackLogId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const loadFeed = useCallback(async () => {
    if (!profile?.house_id) return;
    const memberIds = (await supabase
      .from('profiles')
      .select('id')
      .eq('house_id', profile.house_id)
    ).data?.map((m) => m.id) ?? [];

    const { data } = await supabase
      .from('task_logs')
      .select('*, profiles(username, avatar_url), task_templates(name, icon, category)')
      .in('user_id', memberIds)
      .order('completed_at', { ascending: false })
      .limit(50);

    setFeed((data as FeedItem[]) ?? []);
  }, [profile?.house_id]);

  useEffect(() => {
    loadFeed();
    if (!profile?.house_id) return;

    const channel = supabase
      .channel('feed-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_logs' }, () => {
        loadFeed();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.house_id, loadFeed]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFeed();
    setRefreshing(false);
  };

  const handleVerify = async (logId: string) => {
    Alert.alert('Verify Chore', 'Verify that this chore was properly completed?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Verify & Approve',
        onPress: async () => {
          const res = await verifyTaskLog(logId, profile!.id, profile!.username);
          if (res.success) {
            Alert.alert('Verified! 👍', 'You approved this chore. XP points have been awarded.');
            loadFeed();
          } else {
            Alert.alert('Notice', res.error || 'Failed to verify chore.');
          }
        },
      },
    ]);
  };

  const handleSendFeedback = async () => {
    if (!feedbackLogId || !feedbackText.trim()) return;
    setSubmittingFeedback(true);
    const res = await addAnonymousFeedback(feedbackLogId, feedbackText.trim());
    setSubmittingFeedback(false);

    if (res.success) {
      setFeedbackText('');
      setFeedbackLogId(null);
      loadFeed();
    } else {
      Alert.alert('Error', res.error || 'Failed to post feedback.');
    }
  };

  const handleReaction = (logId: string, iconKey: string) => {
    setReactions((prev) => ({
      ...prev,
      [logId]: [...(prev[logId] ?? []), iconKey],
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
      <View style={styles.titleRow}>
        <Ionicons name="newspaper-outline" size={26} color={COLORS.text} />
        <Text style={styles.title}>Activity Feed</Text>
      </View>

      <FlatList
        data={feed}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Ionicons name="chatbubbles-outline" size={48} color={COLORS.textLight} />
            <Text style={styles.emptyTitle}>No chore logs yet</Text>
            <Text style={styles.emptySub}>Log chores or claim tasks in Marketplace to populate the feed!</Text>
          </View>
        }
        renderItem={({ item }) => {
          const meta: TaskLogMetadata = parseLogNotes(item.notes);
          const isPending = meta.status === 'pending_verification';
          const isMine = item.user_id === profile?.id;

          return (
            <View style={styles.card}>
              {/* Card Header */}
              <View style={styles.cardHeader}>
                <Text style={styles.avatar}>{item.profiles?.avatar_url || '🧑'}</Text>
                <View style={styles.headerInfo}>
                  <Text style={styles.username}>{item.profiles?.username || 'Roommate'}</Text>
                  <Text style={styles.time}>{timeAgo(item.completed_at)}</Text>
                </View>
                <View style={[styles.creditsPill, isPending && styles.creditsPillPending]}>
                  <Ionicons name="flash" size={12} color={isPending ? COLORS.accent : COLORS.primary} />
                  <Text style={[styles.creditsText, isPending && { color: COLORS.accent }]}>
                    {isPending ? `+${item.credits_awarded} XP pending` : `+${item.credits_awarded} XP`}
                  </Text>
                </View>
              </View>

              {/* Task Row */}
              <View style={styles.taskRow}>
                <View style={styles.iconBox}>
                  <AppIcon
                    name={item.task_templates?.icon}
                    category={item.task_templates?.category}
                    size={20}
                    color={COLORS.primary}
                  />
                </View>
                <Text style={styles.taskName}>{item.task_templates?.name || 'Completed Chore'}</Text>
              </View>

              {/* Note */}
              {meta.note ? (
                <View style={styles.noteBox}>
                  <Ionicons name="chatbubble-outline" size={14} color={COLORS.textSecondary} />
                  <Text style={styles.noteText}>{meta.note}</Text>
                </View>
              ) : null}

              {/* Photo Proof Preview */}
              {item.photo_url ? (
                <View style={styles.photoContainer}>
                  <Image source={{ uri: item.photo_url }} style={styles.photoProof} resizeMode="cover" />
                  <View style={styles.photoBadge}>
                    <Ionicons name="camera" size={12} color="#FFF" />
                    <Text style={styles.photoBadgeText}>Photo Proof</Text>
                  </View>
                </View>
              ) : null}

              {/* Verification Section */}
              <View style={styles.verificationSection}>
                {isPending ? (
                  <View style={styles.pendingVerifyRow}>
                    <View style={styles.pendingBadge}>
                      <Ionicons name="time" size={14} color={COLORS.accent} />
                      <Text style={styles.pendingText}>
                        {isMine ? 'Waiting for roommate vote' : 'Needs verification'}
                      </Text>
                    </View>
                    {!isMine && (
                      <TouchableOpacity style={styles.verifyBtn} onPress={() => handleVerify(item.id)}>
                        <Ionicons name="checkmark-circle" size={16} color="#FFF" />
                        <Text style={styles.verifyBtnText}>Verify Chore</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  <View style={styles.verifiedRow}>
                    <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                    <Text style={styles.verifiedText}>
                      Verified {meta.verifiedByName ? `by ${meta.verifiedByName}` : 'and approved'}
                    </Text>
                  </View>
                )}
              </View>

              {/* Anonymous Feedbacks */}
              {meta.feedbacks && meta.feedbacks.length > 0 && (
                <View style={styles.feedbackList}>
                  {meta.feedbacks.map((fb) => (
                    <View key={fb.id} style={styles.feedbackItem}>
                      <View style={styles.feedbackHeader}>
                        <Ionicons name="person-circle-outline" size={14} color={COLORS.textSecondary} />
                        <Text style={styles.anonLabel}>Anonymous Roommate</Text>
                        <Text style={styles.feedbackTime}>{timeAgo(fb.createdAt)}</Text>
                      </View>
                      <Text style={styles.feedbackText}>{fb.text}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Action Buttons: Anonymous Feedback & Nudge */}
              <View style={styles.footerRow}>
                <TouchableOpacity
                  style={styles.actionPill}
                  onPress={() => setFeedbackLogId(item.id)}
                >
                  <Ionicons name="chatbox-ellipses-outline" size={14} color={COLORS.primary} />
                  <Text style={styles.actionPillText}>Anonymous Feedback</Text>
                </TouchableOpacity>

                {/* Nudge if other member */}
                {item.user_id !== profile?.id && (
                  <TouchableOpacity
                    style={styles.actionPillSecondary}
                    onPress={() => {
                      sendNudge(item.user_id).catch(() => {});
                      Alert.alert('Nudge Sent! 👋', `Sent a high-five to ${item.profiles?.username}.`);
                    }}
                  >
                    <Ionicons name="hand-right-outline" size={14} color={COLORS.textSecondary} />
                    <Text style={styles.actionPillSecondaryText}>High Five</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
      />

      {/* Modal: Add Anonymous Feedback */}
      <Modal visible={!!feedbackLogId} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.primary} />
                <Text style={styles.modalTitle}>Leave Anonymous Feedback</Text>
              </View>
              <TouchableOpacity onPress={() => setFeedbackLogId(null)}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.anonNotice}>
              Your name and identity will NOT be attached. Roommates will only see "Anonymous Roommate".
            </Text>

            <TextInput
              style={styles.feedbackInput}
              placeholder="e.g. Thanks for cleaning the microwave! Looks great."
              placeholderTextColor={COLORS.textLight}
              value={feedbackText}
              onChangeText={setFeedbackText}
              multiline
              autoFocus
            />

            <TouchableOpacity
              style={[styles.submitFeedbackBtn, submittingFeedback && { opacity: 0.6 }]}
              onPress={handleSendFeedback}
              disabled={submittingFeedback}
            >
              <Ionicons name="paper-plane-outline" size={18} color="#FFF" />
              <Text style={styles.submitFeedbackText}>
                {submittingFeedback ? 'Posting...' : 'Post Anonymous Feedback'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA', paddingTop: 44, paddingHorizontal: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '800', color: '#1A1A24' },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.sm,
    padding: 24,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#ECECEC',
  },
  emptyTitle: { fontSize: 13, fontWeight: '700', color: '#1A1A24', marginTop: 6 },
  emptySub: { fontSize: 11, color: '#7E7E8F', textAlign: 'center', marginTop: 3 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.sm,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ECECEC',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  avatar: { fontSize: 24, marginRight: 8 },
  headerInfo: { flex: 1 },
  username: { fontSize: 12, fontWeight: '700', color: '#1A1A24' },
  time: { fontSize: 10, color: '#9090A0' },
  creditsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    gap: 3,
  },
  creditsPillPending: { backgroundColor: '#FFF4E5' },
  creditsText: { fontSize: 10, fontWeight: '800', color: COLORS.primary },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 5,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskName: { fontSize: 12, fontWeight: '700', color: '#1A1A24' },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    backgroundColor: '#F9F9FB',
    padding: 6,
    borderRadius: 4,
    marginBottom: 4,
  },
  noteText: { fontSize: 11, color: '#4A4A5A', flex: 1 },
  photoContainer: { position: 'relative', marginTop: 4, marginBottom: 6, borderRadius: 6, overflow: 'hidden' },
  photoProof: { width: '100%', height: 150, borderRadius: 6 },
  photoBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    gap: 3,
  },
  photoBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '700' },
  verificationSection: {
    marginTop: 2,
    marginBottom: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F2',
  },
  pendingVerifyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF4E5',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    gap: 3,
  },
  pendingText: { fontSize: 10, fontWeight: '700', color: COLORS.accent },
  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    gap: 3,
  },
  verifyBtnText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { fontSize: 10, fontWeight: '600', color: COLORS.success },
  feedbackList: { backgroundColor: '#F9F9FB', borderRadius: 4, padding: 6, marginBottom: 6 },
  feedbackItem: { marginBottom: 4 },
  feedbackHeader: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 1 },
  anonLabel: { fontSize: 9, fontWeight: '700', color: '#7E7E8F' },
  feedbackTime: { fontSize: 8, color: '#A0A0B0', marginLeft: 'auto' },
  feedbackText: { fontSize: 11, color: '#1A1A24', paddingLeft: 12 },
  footerRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    gap: 3,
  },
  actionPillText: { fontSize: 10, fontWeight: '700', color: COLORS.primary },
  actionPillSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECEC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    gap: 3,
  },
  actionPillSecondaryText: { fontSize: 10, fontWeight: '600', color: '#7E7E8F' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 16 },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: RADIUS.sm, padding: 14 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modalTitle: { fontSize: 13, fontWeight: '800', color: '#1A1A24' },
  anonNotice: { fontSize: 10, color: '#7E7E8F', marginBottom: 8, lineHeight: 14 },
  feedbackInput: {
    backgroundColor: '#F9F9FB',
    borderWidth: 1,
    borderColor: '#ECECEC',
    borderRadius: 4,
    padding: 8,
    height: 70,
    color: '#1A1A24',
    fontSize: 11,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  submitFeedbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingVertical: 9,
    gap: 4,
  },
  submitFeedbackText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
});
