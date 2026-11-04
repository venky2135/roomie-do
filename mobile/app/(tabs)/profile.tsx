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
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import { submitLeaveRequest } from '../../lib/leaveWorkflow';
import { isLogApproved } from '../../lib/taskWorkflow';
import GroceryListModal from '../../components/GroceryListModal';
import BadgesJourney from '../../components/BadgesJourney';

export default function ProfileScreen() {
  const { profile, signOut, refreshProfile } = useAuthStore();
  const [completedCount, setCompletedCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Leave Request Modal State
  const [leaveModalVisible, setLeaveModalVisible] = useState(false);
  const [groceryModalVisible, setGroceryModalVisible] = useState(false);
  const [leaveDuration, setLeaveDuration] = useState('');
  const [leaveStartDate, setLeaveStartDate] = useState('');
  const [leaveEndDate, setLeaveEndDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveXp, setLeaveXp] = useState('25');
  const [leaveComments, setLeaveComments] = useState('');
  const [submittingLeave, setSubmittingLeave] = useState(false);

  const loadStats = async () => {
    if (!profile?.id) return;
    try {
      const { data } = await supabase
        .from('task_logs')
        .select('notes')
        .eq('user_id', profile.id);
      const approvedCount = data?.filter((l) => isLogApproved(l.notes)).length ?? 0;
      setCompletedCount(approvedCount);
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

  const handleApplyLeave = async () => {
    if (!profile?.id || !profile?.house_id) return;

    if (!leaveDuration.trim()) {
      const msg = 'Please enter leave duration (e.g. Nov 5 - Nov 10).';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Required', msg);
      return;
    }

    if (!leaveReason.trim()) {
      const msg = 'Please enter reason for leave.';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Required', msg);
      return;
    }

    setSubmittingLeave(true);
    const res = await submitLeaveRequest({
      userId: profile.id,
      houseId: profile.house_id,
      duration: leaveDuration,
      startDate: leaveStartDate.trim() || undefined,
      endDate: leaveEndDate.trim() || undefined,
      reason: leaveReason,
      requestedXp: Math.max(0, parseInt(leaveXp, 10) || 0),
      comments: leaveComments,
    });
    setSubmittingLeave(false);

    if (res.success) {
      setLeaveModalVisible(false);
      setLeaveDuration('');
      setLeaveStartDate('');
      setLeaveEndDate('');
      setLeaveReason('');
      setLeaveComments('');
      const successMsg = 'Leave request submitted! It is now posted to the Live Feed. Once all roommates approve, your leave is granted and XP will be awarded.';
      if (Platform.OS === 'web') alert(successMsg);
      else Alert.alert('Request Sent 🌴', successMsg);
      router.push('/(tabs)/feed');
    } else {
      const errMsg = res.error || 'Failed to submit leave request';
      if (Platform.OS === 'web') alert(errMsg);
      else Alert.alert('Error', errMsg);
    }
  };

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
      const confirmed =
        typeof window !== 'undefined'
          ? window.confirm('Are you sure you want to sign out?')
          : true;
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
    >
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarLarge}>{profile?.avatar_url || '🧑'}</Text>
        </View>
        <Text style={styles.username}>{profile?.username || 'Roommate'}</Text>
        {profile?.phone && <Text style={styles.phone}>{profile.phone}</Text>}
        <View style={styles.xpPill}>
          <Ionicons name="flash" size={12} color="#FFF" />
          <Text style={styles.xpPillText}>{profile?.xp ?? 0} Total XP</Text>
        </View>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Ionicons name="trophy-outline" size={22} color={COLORS.primary} />
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

      {/* ── Animated Badge Journey ── */}
      <BadgesJourney profile={profile} approvedCount={completedCount} />

      {/* ─── Quick Actions Heading & Square Container ─── */}
      <View style={styles.sectionHeaderRow}>
        <Ionicons name="flash-outline" size={18} color={COLORS.text} />
        <Text style={styles.sectionTitle}>Quick Actions</Text>
      </View>

      <View style={styles.quickActionsContainer}>
        {/* Admin Options Button */}
        {profile?.is_admin ? (
          <TouchableOpacity
            style={styles.actionSquareBtn}
            onPress={() => router.push('/house/admin')}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIconCircle, { backgroundColor: '#F3E8FF' }]}>
              <Ionicons name="settings" size={20} color="#9333EA" />
            </View>
            <View style={[styles.actionTagBadge, { backgroundColor: '#9333EA' }]}>
              <Text style={styles.actionTagText}>Admin</Text>
            </View>
            <Text style={styles.actionBtnLabel}>Admin Options</Text>
            <Text style={styles.actionBtnSub}>House settings</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionSquareBtn, { opacity: 0.65 }]}
            onPress={() => {
              const msg = 'Admin options are only accessible by the house admin (👑).';
              if (Platform.OS === 'web') alert(msg);
              else Alert.alert('Admin Access', msg);
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIconCircle, { backgroundColor: '#F1F5F9' }]}>
              <Ionicons name="lock-closed" size={20} color="#64748B" />
            </View>
            <Text style={styles.actionBtnLabel}>Admin Options</Text>
            <Text style={styles.actionBtnSub}>Admin only</Text>
          </TouchableOpacity>
        )}

        {/* Leave Request Button */}
        <TouchableOpacity
          style={styles.actionSquareBtn}
          onPress={() => setLeaveModalVisible(true)}
          activeOpacity={0.7}
        >
          <View style={[styles.actionIconCircle, { backgroundColor: '#E0F2FE' }]}>
            <Ionicons name="airplane" size={20} color="#0284C7" />
          </View>
          <Text style={styles.actionBtnLabel}>Leave Request</Text>
          <Text style={styles.actionBtnSub}>Vacation pass</Text>
        </TouchableOpacity>

        {/* Grocery List Button */}
        <TouchableOpacity
          style={styles.actionSquareBtn}
          onPress={() => setGroceryModalVisible(true)}
          activeOpacity={0.7}
        >
          <View style={[styles.actionIconCircle, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="cart" size={20} color="#D97706" />
          </View>
          <Text style={styles.actionBtnLabel}>Grocery List</Text>
          <Text style={styles.actionBtnSub}>Shared items</Text>
        </TouchableOpacity>

        {/* Sign Out Button */}
        <TouchableOpacity
          style={styles.actionSquareBtn}
          onPress={handleSignOut}
          activeOpacity={0.7}
        >
          <View style={[styles.actionIconCircle, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="log-out" size={20} color="#EF4444" />
          </View>
          <Text style={[styles.actionBtnLabel, { color: '#EF4444' }]}>Sign Out</Text>
          <Text style={styles.actionBtnSub}>Exit account</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Modal: Apply for Leave ─── */}
      <Modal visible={leaveModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="airplane" size={20} color={COLORS.primary} />
                <Text style={styles.modalTitle}>Apply for Leave</Text>
              </View>
              <TouchableOpacity onPress={() => setLeaveModalVisible(false)}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>
              All roommates must approve your request in the Live Feed. Once approved, you'll be marked on leave in the leaderboard and awarded the requested XP.
            </Text>

            {/* Leave Duration */}
            <Text style={styles.inputLabel}>Leave Duration *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Nov 5 - Nov 10 (5 days)"
              placeholderTextColor={COLORS.textLight}
              value={leaveDuration}
              onChangeText={setLeaveDuration}
            />

            {/* Dates (Optional Range) */}
            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabelSmall}>Start Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.modalInputSmall}
                  placeholder="2026-11-05"
                  placeholderTextColor={COLORS.textLight}
                  value={leaveStartDate}
                  onChangeText={setLeaveStartDate}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabelSmall}>End Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.modalInputSmall}
                  placeholder="2026-11-10"
                  placeholderTextColor={COLORS.textLight}
                  value={leaveEndDate}
                  onChangeText={setLeaveEndDate}
                />
              </View>
            </View>

            {/* Reason for Leave */}
            <Text style={styles.inputLabel}>Reason for Leave *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Visiting hometown / College exams"
              placeholderTextColor={COLORS.textLight}
              value={leaveReason}
              onChangeText={setLeaveReason}
            />

            {/* Requesting XP Points */}
            <Text style={styles.inputLabel}>Requesting XP Points</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. 25"
              placeholderTextColor={COLORS.textLight}
              keyboardType="number-pad"
              value={leaveXp}
              onChangeText={setLeaveXp}
            />
            <Text style={styles.helperText}>
              XP points will be credited to you once all housemates approve.
            </Text>

            {/* Comments */}
            <Text style={styles.inputLabel}>Comments / Note</Text>
            <TextInput
              style={[styles.modalInput, { height: 60, textAlignVertical: 'top' }]}
              placeholder="e.g. Cleaned kitchen in advance; will resume chores on return"
              placeholderTextColor={COLORS.textLight}
              value={leaveComments}
              onChangeText={setLeaveComments}
              multiline
            />

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitLeaveBtn, submittingLeave && { opacity: 0.6 }]}
              onPress={handleApplyLeave}
              disabled={submittingLeave}
            >
              {submittingLeave ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Ionicons name="send" size={16} color="#FFF" />
                  <Text style={styles.submitLeaveBtnText}>Submit Leave Request</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── Grocery List Modal ─── */}
      <GroceryListModal
        visible={groceryModalVisible}
        onClose={() => setGroceryModalVisible(false)}
      />
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
  // Quick Actions Container & Square Small Buttons
  quickActionsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ECECEC',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 16,
  },
  actionSquareBtn: {
    width: '48%',
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#ECECEC',
    borderRadius: RADIUS.sm,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  actionIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  actionBtnLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A1A24',
    textAlign: 'center',
  },
  actionBtnSub: {
    fontSize: 8,
    color: '#7E7E8F',
    marginTop: 1,
    textAlign: 'center',
  },
  actionTagBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#D97706',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  actionTagText: {
    fontSize: 7,
    fontWeight: '800',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },

  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 14 },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: RADIUS.md, padding: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modalTitle: { fontSize: 15, fontWeight: '800', color: '#1A1A24' },
  modalSub: { fontSize: 10, color: '#7E7E8F', marginBottom: 10, lineHeight: 14 },
  inputLabel: { fontSize: 9, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: 3, marginTop: 6 },
  inputLabelSmall: { fontSize: 8, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: 2 },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 11,
    color: '#1A1A24',
  },
  dateRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  modalInputSmall: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 10,
    color: '#1A1A24',
  },
  helperText: { fontSize: 9, color: '#94A3B8', marginTop: 2 },
  submitLeaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284C7',
    borderRadius: RADIUS.sm,
    paddingVertical: 11,
    marginTop: 14,
    gap: 6,
  },
  submitLeaveBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
});
