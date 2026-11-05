import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase, supabaseAdmin } from '../../lib/supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import AppIcon from '../../components/AppIcon';
import { notifyChoreApproved } from '../../lib/api';
import {
  parseLogNotes,
  encodeLogNotes,
  verifyTaskLog,
  addAnonymousFeedback,
  toggleTaskLogReaction,
  TaskLogMetadata,
} from '../../lib/taskWorkflow';
import {
  parseLeaveMetadata,
  approveLeaveRequest,
  deleteLeaveRequest,
} from '../../lib/leaveWorkflow';

const REACTION_EMOJIS = ['🙌', '🔥', '👏', '❤️', '⚡'];

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
  const { profile, refreshProfile } = useAuthStore();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [membersCount, setMembersCount] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  // Suppress realtime reload during optimistic reaction/feedback updates to prevent flicker
  const suppressRealtimeRef = useRef(false);

  // Anonymous Feedback Modal (for chore logs and leave requests) State
  const [feedbackLogId, setFeedbackLogId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const loadFeed = useCallback(async () => {
    if (!profile?.house_id) return;
    try {
      const { data: memberProfiles } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('house_id', profile.house_id);

      const memberIds = memberProfiles?.map((m) => m.id) ?? [];
      setMembersCount(memberIds.length);

      if (memberIds.length === 0) {
        setFeed([]);
        return;
      }

      const { data } = await supabaseAdmin
        .from('task_logs')
        .select('*, profiles(username, avatar_url), task_templates(name, icon, category)')
        .in('user_id', memberIds)
        .order('completed_at', { ascending: false })
        .limit(50);

      setFeed((data as FeedItem[]) ?? []);
    } catch (_) {}
  }, [profile?.house_id]);

  useEffect(() => {
    loadFeed();
    if (!profile?.house_id) return;

    const channel = supabase
      .channel('feed-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_logs' }, () => {
        if (!suppressRealtimeRef.current) { loadFeed(); }
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
    if (!profile?.id) return;

    const targetItem = feed.find((f) => f.id === logId);
    if (targetItem && targetItem.user_id === profile.id) {
      if (Platform.OS === 'web') {
        alert('You cannot approve your own chore. A roommate must approve it.');
      } else {
        Alert.alert('Notice', 'You cannot approve your own chore. A roommate must approve it.');
      }
      return;
    }

    const executeApprove = async () => {
      // Optimistically update feed immediately to approved
      setFeed((prevFeed) =>
        prevFeed.map((log) => {
          if (log.id === logId) {
            const currentMeta = parseLogNotes(log.notes);
            const updatedMeta: TaskLogMetadata = {
              ...currentMeta,
              status: 'completed',
              verifiedBy: profile.id,
              verifiedByName: profile.username,
              verifiedAt: new Date().toISOString(),
            };
            return { ...log, notes: encodeLogNotes(updatedMeta) };
          }
          return log;
        })
      );

      const res = await verifyTaskLog(logId, profile.id, profile.username);
      if (res.success && targetItem?.user_id) {
        notifyChoreApproved({
          logId,
          workerUserId: targetItem.user_id,
          taskName: (targetItem as any).task?.name || 'chore',
          award: targetItem.credits_awarded || 20,
        }).catch((err) => console.warn('[PushNotification] Failed to notify chore creator:', err));
      }
      if (res.success) {
        if (Platform.OS === 'web') {
          alert('Approved! 👍 XP points have been awarded.');
        } else {
          Alert.alert('Approved! 👍', 'You approved this chore. XP points have been awarded.');
        }
        await loadFeed();
        refreshProfile();
      } else {
        if (Platform.OS === 'web') {
          alert(res.error || 'Failed to approve chore.');
        } else {
          Alert.alert('Notice', res.error || 'Failed to approve chore.');
        }
        await loadFeed();
      }
    };

    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined'
          ? window.confirm('Approve this chore and award XP points?')
          : true;
      if (confirmed) {
        await executeApprove();
      }
    } else {
      Alert.alert('Approve Chore', 'Approve this chore and award XP to your roommate?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: executeApprove },
      ]);
    }
  };

  const handleApproveLeave = async (logId: string) => {
    if (!profile?.id || !profile?.house_id) return;

    const doApprove = async () => {
      const res = await approveLeaveRequest({
        logId,
        approverUserId: profile.id,
        approverUsername: profile.username,
        houseId: profile.house_id!,
      });

      if (res.success) {
        if (res.isFullyApproved) {
          const msg = 'Leave approved! All roommates have approved this request and XP points have been awarded.';
          if (Platform.OS === 'web') alert(msg);
          else Alert.alert('Fully Approved! 🎉', msg);
        } else {
          const msg = 'You approved this leave request. Waiting for remaining roommates to approve.';
          if (Platform.OS === 'web') alert(msg);
          else Alert.alert('Approved 👍', msg);
        }
        await loadFeed();
        refreshProfile();
      } else {
        const err = res.error || 'Failed to approve leave request';
        if (Platform.OS === 'web') alert(err);
        else Alert.alert('Notice', err);
        await loadFeed();
      }
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Approve this leave request for your roommate?')) {
        await doApprove();
      }
    } else {
      Alert.alert('Approve Leave', 'Approve this leave request for your roommate?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: doApprove },
      ]);
    }
  };

  const handleDeleteLeave = async (logId: string) => {
    if (!profile?.id) return;

    const doDelete = async () => {
      // Optimistic delete
      setFeed((prev) => prev.filter((item) => item.id !== logId));
      const res = await deleteLeaveRequest(logId, profile.id);
      if (!res.success) {
        const err = res.error || 'Failed to delete leave request';
        if (Platform.OS === 'web') alert(err);
        else Alert.alert('Error', err);
        await loadFeed();
      }
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Delete this leave request?')) {
        await doDelete();
      }
    } else {
      Alert.alert('Delete Leave Request', 'Are you sure you want to delete your leave request?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleSendFeedback = async () => {
    if (!feedbackLogId || !feedbackText.trim()) return;
    const textToSend = feedbackText.trim();
    const logId = feedbackLogId;
    setSubmittingFeedback(true);

    const tempFeedback = {
      id: Math.random().toString(36).slice(2, 9),
      text: textToSend,
      createdAt: new Date().toISOString(),
      isAnonymous: true,
    };

    // Optimistically reflect immediately on the chore card as floating badge
    setFeed((prevFeed) =>
      prevFeed.map((item) => {
        if (item.id === logId) {
          const currentMeta = parseLogNotes(item.notes);
          const updatedMeta: TaskLogMetadata = {
            ...currentMeta,
            feedbacks: [...(currentMeta.feedbacks || []), tempFeedback],
          };
          return { ...item, notes: encodeLogNotes(updatedMeta) };
        }
        return item;
      })
    );

    setFeedbackText('');
    setFeedbackLogId(null);

    // Suppress realtime reload during feedback write to avoid overwriting optimistic state
    suppressRealtimeRef.current = true;
    const res = await addAnonymousFeedback(logId, textToSend);
    suppressRealtimeRef.current = false;
    setSubmittingFeedback(false);

    if (!res.success) {
      if (Platform.OS === 'web') {
        alert(res.error || 'Failed to submit feedback.');
      } else {
        Alert.alert('Error', res.error || 'Failed to submit feedback.');
      }
      await loadFeed();
    }
  };

  const handleEmojiReaction = async (logId: string, emoji: string) => {
    if (!profile?.id) return;

    // Optimistic toggle
    setFeed((prevFeed) =>
      prevFeed.map((item) => {
        if (item.id === logId) {
          const currentMeta = parseLogNotes(item.notes);
          const currentReactions = { ...(currentMeta.reactions || {}) };
          const userList = currentReactions[emoji] || [];

          if (userList.includes(profile.id)) {
            currentReactions[emoji] = userList.filter((uid) => uid !== profile.id);
          } else {
            currentReactions[emoji] = [...userList, profile.id];
          }

          const updatedMeta: TaskLogMetadata = {
            ...currentMeta,
            reactions: currentReactions,
          };
          return { ...item, notes: encodeLogNotes(updatedMeta) };
        }
        return item;
      })
    );

    // Correct arg order: (logId, userId, emoji) — suppress realtime reload on success to avoid flicker
    suppressRealtimeRef.current = true;
    const res = await toggleTaskLogReaction(logId, profile.id, emoji);
    suppressRealtimeRef.current = false;
    if (!res.success) {
      await loadFeed();
    }
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
            <Text style={styles.emptyTitle}>No activity logs yet</Text>
            <Text style={styles.emptySub}>Log chores, claim tasks, or apply for leave to populate the feed!</Text>
          </View>
        }
        renderItem={({ item }) => {
          // Check if item is a Leave Request
          const leaveMeta = parseLeaveMetadata(item.notes);

          if (leaveMeta) {
            const isMine = item.user_id === profile?.id;
            const isApproved = leaveMeta.status === 'approved';
            const totalNeeded = Math.max(1, membersCount - 1);
            const approvedCount = leaveMeta.approvals.length;
            const hasApproved = profile?.id ? leaveMeta.approvals.includes(profile.id) : false;

            return (
              <View style={[styles.card, styles.leaveCard, isApproved && styles.leaveCardApproved]}>
                {/* Leave Card Header */}
                <View style={styles.cardHeader}>
                  <Text style={styles.avatar}>{item.profiles?.avatar_url || '🧑'}</Text>
                  <View style={styles.headerInfo}>
                    <View style={styles.usernameRow}>
                      <Text style={styles.username}>{item.profiles?.username || 'Roommate'}</Text>
                      <View style={styles.leavePillTag}>
                        <Ionicons name="airplane" size={10} color="#0284C7" />
                        <Text style={styles.leavePillText}>LEAVE REQUEST</Text>
                      </View>
                    </View>
                    <Text style={styles.time}>{timeAgo(item.completed_at)}</Text>
                  </View>
                  <View style={[styles.creditsPill, styles.leaveCreditsPill]}>
                    <Ionicons name="flash" size={12} color="#0284C7" />
                    <Text style={[styles.creditsText, { color: '#0284C7' }]}>
                      {isApproved ? `+${leaveMeta.requestedXp} XP awarded` : `+${leaveMeta.requestedXp} XP requested`}
                    </Text>
                  </View>
                </View>

                {/* Leave Details Box */}
                <View style={styles.leaveDetailsBox}>
                  <View style={styles.leaveDetailRow}>
                    <Ionicons name="calendar-outline" size={13} color="#0284C7" />
                    <Text style={styles.leaveDetailLabel}>Duration:</Text>
                    <Text style={styles.leaveDetailValue}>{leaveMeta.duration}</Text>
                  </View>
                  <View style={styles.leaveDetailRow}>
                    <Ionicons name="document-text-outline" size={13} color="#64748B" />
                    <Text style={styles.leaveDetailLabel}>Reason:</Text>
                    <Text style={styles.leaveDetailValue}>{leaveMeta.reason}</Text>
                  </View>
                  {leaveMeta.comments ? (
                    <View style={styles.leaveDetailRow}>
                      <Ionicons name="chatbubble-ellipses-outline" size={13} color="#64748B" />
                      <Text style={styles.leaveDetailLabel}>Comments:</Text>
                      <Text style={styles.leaveDetailValue} numberOfLines={2}>
                        "{leaveMeta.comments}"
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Status & Approvals Section */}
                <View style={styles.leaveStatusSection}>
                  {isApproved ? (
                    <View style={styles.leaveApprovedRow}>
                      <Ionicons name="checkmark-circle" size={15} color={COLORS.success} />
                      <Text style={styles.leaveApprovedText}>
                        Approved by all roommates (+{leaveMeta.requestedXp} XP awarded)
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.leavePendingRow}>
                      <View style={styles.pendingBadge}>
                        <Ionicons name="time" size={12} color="#D97706" />
                        <Text style={styles.pendingText}>
                          Approved by {approvedCount} of {totalNeeded} roommates
                        </Text>
                      </View>
                      {!isMine && (
                        hasApproved ? (
                          <View style={styles.alreadyApprovedBadge}>
                            <Ionicons name="checkmark" size={12} color={COLORS.success} />
                            <Text style={styles.alreadyApprovedText}>You approved</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.approveLeaveBtn}
                            onPress={() => handleApproveLeave(item.id)}
                          >
                            <Ionicons name="checkmark-circle" size={14} color="#FFF" />
                            <Text style={styles.verifyBtnText}>Approve Leave</Text>
                          </TouchableOpacity>
                        )
                      )}
                    </View>
                  )}

                  {/* Delete option for the requester */}
                  {isMine && (
                    <TouchableOpacity
                      style={styles.deleteLeaveBtn}
                      onPress={() => handleDeleteLeave(item.id)}
                    >
                      <Ionicons name="trash-outline" size={12} color={COLORS.error} />
                      <Text style={styles.deleteLeaveBtnText}>Delete Request</Text>
                    </TouchableOpacity>
                  )}
                </View>

              {/* Leave Feedback Badges */}
              {(() => {
                const leaveFeedbacks = (() => {
                  try {
                    const p = JSON.parse(item.notes || '');
                    return Array.isArray(p.feedbacks) ? p.feedbacks : [];
                  } catch { return []; }
                })();
                return leaveFeedbacks.length > 0 ? (
                  <View style={styles.floatingFeedbackWrapper}>
                    {leaveFeedbacks.map((fb: any) => (
                      <View key={fb.id} style={styles.floatingFeedbackBadge}>
                        <View style={styles.floatingTag}>
                          <Ionicons name="eye-off" size={11} color="#FFF" />
                        </View>
                        <Text style={styles.floatingFeedbackQuote} numberOfLines={2}>
                          "{fb.text}"
                        </Text>
                        <Text style={styles.floatingFeedbackTime}>{timeAgo(fb.createdAt)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null;
              })()}

              {/* Leave card footer: Feedback button */}
              <View style={styles.cardBottomRow}>
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                  style={styles.anonActionBtn}
                  onPress={() => setFeedbackLogId(item.id)}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={12} color={COLORS.primary} />
                  <Text style={styles.anonActionText}>Feedback</Text>
                </TouchableOpacity>
              </View>
              </View>
            );
          }

          // Regular Chore Log Card
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
                      <Ionicons name="time" size={12} color={COLORS.accent} />
                      <Text style={styles.pendingText}>
                        {isMine ? 'Pending roommate approval' : 'Needs approval'}
                      </Text>
                    </View>
                    {!isMine && (
                      <TouchableOpacity style={styles.verifyBtn} onPress={() => handleVerify(item.id)}>
                        <Ionicons name="checkmark-circle" size={14} color="#FFF" />
                        <Text style={styles.verifyBtnText}>Approve</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  <View style={styles.verifiedRow}>
                    <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                    <Text style={styles.verifiedText}>
                      Approved {meta.verifiedByName ? `by ${meta.verifiedByName}` : ''}
                    </Text>
                  </View>
                )}
              </View>

              {/* Floating Anonymous Feedback Badges */}
              {meta.feedbacks && meta.feedbacks.length > 0 && (
                <View style={styles.floatingFeedbackWrapper}>
                  {meta.feedbacks.map((fb) => (
                    <View key={fb.id} style={styles.floatingFeedbackBadge}>
                      <View style={styles.floatingTag}>
                        <Ionicons name="eye-off" size={11} color="#FFF" />
                      </View>
                      <Text style={styles.floatingFeedbackQuote} numberOfLines={2}>
                        "{fb.text}"
                      </Text>
                      <Text style={styles.floatingFeedbackTime}>{timeAgo(fb.createdAt)}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Card Footer: 5 Reaction Emojis & Anonymous Feedback Button */}
              <View style={styles.cardBottomRow}>
                {/* 5 Emojis with Live Counts & Member Highlights */}
                <View style={styles.reactionsBar}>
                  {REACTION_EMOJIS.map((emoji) => {
                    const userIds = meta.reactions?.[emoji] || [];
                    const count = userIds.length;
                    const hasReacted = profile?.id ? userIds.includes(profile.id) : false;

                    return (
                      <TouchableOpacity
                        key={emoji}
                        style={[
                          styles.reactionBtn,
                          hasReacted && styles.reactionBtnActive,
                        ]}
                        onPress={() => handleEmojiReaction(item.id, emoji)}
                      >
                        <Text style={styles.reactionEmoji}>{emoji}</Text>
                        {count > 0 && (
                          <Text
                            style={[
                              styles.reactionCount,
                              hasReacted && styles.reactionCountActive,
                            ]}
                          >
                            {count}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Anonymous Feedback Button */}
                <TouchableOpacity
                  style={styles.anonActionBtn}
                  onPress={() => setFeedbackLogId(item.id)}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={12} color={COLORS.primary} />
                  <Text style={styles.anonActionText}>Feedback</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />

      {/* Modal: Add Anonymous Feedback */}
      <Modal visible={!!feedbackLogId} transparent animationType="fade" onRequestClose={() => setFeedbackLogId(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="eye-off" size={16} color={COLORS.primary} />
                <Text style={styles.modalTitle}>Leave Anonymous Feedback</Text>
              </View>
              <TouchableOpacity onPress={() => setFeedbackLogId(null)}>
                <Ionicons name="close" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.anonNotice}>
              Your name and identity will NOT be attached. Roommates will only see "Anonymous Roommate".
            </Text>

            <TextInput
              style={styles.feedbackInput}
              placeholder="e.g. Thanks! Next time remember to empty the lint filter."
              placeholderTextColor={COLORS.textLight}
              value={feedbackText}
              onChangeText={setFeedbackText}
              multiline
              maxLength={200}
            />

            <TouchableOpacity
              style={[styles.submitFeedbackBtn, submittingFeedback && { opacity: 0.6 }]}
              onPress={handleSendFeedback}
              disabled={submittingFeedback}
            >
              <Ionicons name="send" size={14} color="#FFF" />
              <Text style={styles.submitFeedbackText}>
                {submittingFeedback ? 'Posting...' : 'Post Anonymous Feedback'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA', paddingTop: 44, paddingHorizontal: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  title: { fontSize: 16, fontWeight: '800', color: '#1A1A24' },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.sm,
    padding: 24,
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#ECECEC',
  },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A24', marginTop: 8 },
  emptySub: { fontSize: 11, color: '#7E7E8F', textAlign: 'center', marginTop: 4, lineHeight: 16 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.sm,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  avatar: { fontSize: 24, marginRight: 8 },
  headerInfo: { flex: 1 },
  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  username: { fontSize: 12, fontWeight: '700', color: '#1A1A24' },
  time: { fontSize: 9, color: '#7E7E8F', marginTop: 1 },
  creditsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    gap: 2,
  },
  creditsPillPending: {
    backgroundColor: '#FFFBEB',
  },
  creditsText: { color: COLORS.primary, fontWeight: '800', fontSize: 10 },
  taskRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#F3F8F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  taskName: { fontSize: 12, fontWeight: '700', color: '#1A1A24' },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 6,
    borderRadius: 4,
    marginBottom: 6,
    gap: 4,
  },
  noteText: { fontSize: 10, color: '#4B4B58', flex: 1, fontStyle: 'italic' },
  photoContainer: {
    position: 'relative',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 6,
  },
  photoProof: {
    width: '100%',
    height: 140,
    borderRadius: 6,
    backgroundColor: '#F0F0F2',
  },
  photoBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    gap: 3,
  },
  photoBadgeText: { fontSize: 9, color: '#FFF', fontWeight: '700' },
  verificationSection: {
    borderTopWidth: 1,
    borderTopColor: '#F5F5F7',
    paddingTop: 6,
    marginBottom: 4,
  },
  pendingVerifyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    gap: 4,
    alignSelf: 'flex-start',
  },
  pendingText: { fontSize: 10, color: '#D97706', fontWeight: '700' },
  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    gap: 3,
  },
  verifyBtnText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { fontSize: 10, color: COLORS.success, fontWeight: '700' },
  floatingFeedbackWrapper: {
    marginVertical: 4,
    gap: 4,
  },
  floatingFeedbackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  floatingTag: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  floatingFeedbackQuote: {
    fontSize: 10,
    color: '#1E293B',
    fontWeight: '600',
    flex: 1,
    fontStyle: 'italic',
  },
  floatingFeedbackTime: { fontSize: 8, color: '#94A3B8' },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F2',
  },
  reactionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reactionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EFEFEF',
    borderRadius: RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 2,
  },
  reactionBtnActive: {
    backgroundColor: '#E8F5E9',
    borderColor: COLORS.primary,
  },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 10, fontWeight: '700', color: '#7E7E8F' },
  reactionCountActive: { color: COLORS.primary, fontWeight: '800' },
  anonActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    gap: 3,
  },
  anonActionText: { fontSize: 10, fontWeight: '700', color: COLORS.primary },
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

  // Leave Request Specific Card Styles
  leaveCard: {
    borderColor: '#BAE6FD',
    backgroundColor: '#F0F9FF',
  },
  leaveCardApproved: {
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
  },
  leavePillTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: RADIUS.full,
    gap: 3,
  },
  leavePillText: { fontSize: 8, fontWeight: '800', color: '#0284C7' },
  leaveCreditsPill: {
    backgroundColor: '#E0F2FE',
  },
  leaveDetailsBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    padding: 8,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  leaveDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  leaveDetailLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  leaveDetailValue: {
    fontSize: 10,
    color: '#0F172A',
    fontWeight: '600',
    flex: 1,
  },
  leaveStatusSection: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 6,
    gap: 6,
  },
  leaveApprovedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  leaveApprovedText: {
    fontSize: 10,
    color: COLORS.success,
    fontWeight: '800',
  },
  leavePendingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  approveLeaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    gap: 3,
  },
  alreadyApprovedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    gap: 2,
  },
  alreadyApprovedText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.success,
  },
  deleteLeaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    gap: 3,
    marginTop: 2,
  },
  deleteLeaveBtnText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.error,
  },
});
