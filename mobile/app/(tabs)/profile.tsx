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
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import { submitLeaveRequest } from '../../lib/leaveWorkflow';
import { isLogApproved } from '../../lib/taskWorkflow';
import { toLocalDateString, calculateUserStreak } from '../../lib/streakWorkflow';
import GroceryListModal from '../../components/GroceryListModal';
import BadgesJourney from '../../components/BadgesJourney';
import AppDatePicker from '../../components/AppDatePicker';
import ComplaintModal from '../../components/ComplaintModal';
import { useKeyboard } from '../../lib/useKeyboard';

export default function ProfileScreen() {
  const { profile, signOut, refreshProfile } = useAuthStore();
  const { keyboardHeight } = useKeyboard();
  const [completedCount, setCompletedCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Leave Request Modal State
  const [leaveModalVisible, setLeaveModalVisible] = useState(false);
  const [groceryModalVisible, setGroceryModalVisible] = useState(false);
  const [complaintModalVisible, setComplaintModalVisible] = useState(false);
  const [leaveStartDate, setLeaveStartDate] = useState<Date | null>(null);
  const [leaveEndDate, setLeaveEndDate] = useState<Date | null>(null);
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveXp, setLeaveXp] = useState('25');
  const [leaveComments, setLeaveComments] = useState('');
  const [submittingLeave, setSubmittingLeave] = useState(false);

  const loadStats = async () => {
    if (!profile?.id) return;
    try {
      // Calculate latest streak and sync
      await calculateUserStreak(profile.id);

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

    if (!leaveStartDate || !leaveEndDate) {
      const msg = 'Please select both start date and end date for your leave.';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Dates Required', msg);
      return;
    }

    if (leaveEndDate < leaveStartDate) {
      const msg = 'End date cannot be earlier than start date.';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Invalid Date Range', msg);
      return;
    }

    if (!leaveReason.trim()) {
      const msg = 'Please enter reason for leave.';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Required', msg);
      return;
    }

    // Auto-compute duration from mandatory dates
    const startStr = leaveStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = leaveEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const diffTime = leaveEndDate.getTime() - leaveStartDate.getTime();
    const diffDays = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1);
    const duration = `${startStr} - ${endStr} (${diffDays} day${diffDays > 1 ? 's' : ''})`;

    setSubmittingLeave(true);
    const res = await submitLeaveRequest({
      userId: profile.id,
      houseId: profile.house_id,
      duration,
      startDate: toLocalDateString(leaveStartDate),
      endDate: toLocalDateString(leaveEndDate),
      reason: leaveReason.trim(),
      requestedXp: Math.max(0, parseInt(leaveXp, 10) || 0),
      comments: leaveComments.trim(),
    });
    setSubmittingLeave(false);

    if (res.success) {
      setLeaveModalVisible(false);
      setLeaveStartDate(null);
      setLeaveEndDate(null);
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

      {/* ─── Quick Actions / Settings Heading & Container ─── */}
      <View style={styles.sectionHeaderRow}>
        <Ionicons name="flash-outline" size={16} color={COLORS.text} />
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
              <Ionicons name="settings" size={16} color="#9333EA" />
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
              <Ionicons name="lock-closed" size={16} color="#64748B" />
            </View>
            <Text style={styles.actionBtnLabel}>Admin Options</Text>
            <Text style={styles.actionBtnSub}>Admin only</Text>
          </TouchableOpacity>
        )}

        {/* Anonymous Complaint Button */}
        <TouchableOpacity
          style={styles.actionSquareBtn}
          onPress={() => setComplaintModalVisible(true)}
          activeOpacity={0.7}
        >
          <View style={[styles.actionIconCircle, { backgroundColor: '#FFF1F2' }]}>
            <Ionicons name="alert-circle" size={16} color="#E11D48" />
          </View>
          <View style={[styles.actionTagBadge, { backgroundColor: '#E11D48' }]}>
            <Text style={styles.actionTagText}>Anon</Text>
          </View>
          <Text style={styles.actionBtnLabel}>Raise Complaint</Text>
          <Text style={styles.actionBtnSub}>-25 streak rule</Text>
        </TouchableOpacity>

        {/* Leave Request Button */}
        <TouchableOpacity
          style={styles.actionSquareBtn}
          onPress={() => setLeaveModalVisible(true)}
          activeOpacity={0.7}
        >
          <View style={[styles.actionIconCircle, { backgroundColor: '#E0F2FE' }]}>
            <Ionicons name="airplane" size={16} color="#0284C7" />
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
            <Ionicons name="cart" size={16} color="#D97706" />
          </View>
          <Text style={styles.actionBtnLabel}>Grocery List</Text>
          <Text style={styles.actionBtnSub}>Shared items</Text>
        </TouchableOpacity>

        {/* Sign Out Button (Compact full-width bottom bar) */}
        <TouchableOpacity
          style={styles.actionFullBtn}
          onPress={handleSignOut}
          activeOpacity={0.7}
        >
          <View style={[styles.actionIconCircleSmall, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="log-out" size={13} color="#EF4444" />
          </View>
          <Text style={[styles.actionBtnLabel, { color: '#EF4444' }]}>Sign Out</Text>
          <Text style={styles.actionBtnSubFull}>• Exit account</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Modal: Apply for Leave ─── */}
      <Modal
        visible={leaveModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLeaveModalVisible(false)}
        statusBarTranslucent
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View
            style={[
              styles.modalOverlay,
              keyboardHeight > 0 && { paddingBottom: keyboardHeight },
            ]}
          >
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.modalCard,
                  keyboardHeight > 0 && { maxHeight: '78%' },
                ]}
              >
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

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom: 10 }}
                >
                  {/* Mandatory Start & End Dates with DatePicker */}
                  <View style={styles.dateRow}>
                    <View style={{ flex: 1 }}>
                      <AppDatePicker
                        label="Start Date"
                        required
                        value={leaveStartDate}
                        minDate={new Date()}
                        onChange={(date) => {
                          setLeaveStartDate(date);
                          if (!leaveEndDate || date > leaveEndDate) {
                            setLeaveEndDate(date);
                          }
                        }}
                        placeholder="Select start"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppDatePicker
                        label="End Date"
                        required
                        value={leaveEndDate}
                        minDate={leaveStartDate || new Date()}
                        onChange={(date) => setLeaveEndDate(date)}
                        placeholder="Select end"
                      />
                    </View>
                  </View>

                  {/* Calculated Duration Preview Badge */}
                  {leaveStartDate && leaveEndDate && (
                    <View style={styles.durationBadge}>
                      <Ionicons name="time-outline" size={13} color="#0284C7" />
                      <Text style={styles.durationBadgeText}>
                        {(() => {
                          const startStr = leaveStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                          const endStr = leaveEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                          const diffTime = leaveEndDate.getTime() - leaveStartDate.getTime();
                          const diffDays = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1);
                          return `Duration: ${startStr} - ${endStr} (${diffDays} day${diffDays > 1 ? 's' : ''})`;
                        })()}
                      </Text>
                    </View>
                  )}

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
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ─── Grocery List Modal ─── */}
      <GroceryListModal
        visible={groceryModalVisible}
        onClose={() => setGroceryModalVisible(false)}
      />

      {/* ─── Anonymous Complaint Modal ─── */}
      <ComplaintModal
        visible={complaintModalVisible}
        onClose={() => setComplaintModalVisible(false)}
        onSuccess={() => onRefresh()}
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
    padding: 8,
    borderWidth: 1,
    borderColor: '#ECECEC',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 14,
  },
  actionSquareBtn: {
    width: '48.5%',
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#ECECEC',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  actionFullBtn: {
    width: '100%',
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 2,
  },
  actionIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  actionIconCircleSmall: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1A1A24',
    textAlign: 'center',
  },
  actionBtnSub: {
    fontSize: 7.5,
    color: '#7E7E8F',
    marginTop: 1,
    textAlign: 'center',
  },
  actionBtnSubFull: {
    fontSize: 9,
    color: '#94A3B8',
    fontWeight: '500',
  },
  actionTagBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#D97706',
    paddingHorizontal: 3,
    paddingVertical: 0.5,
    borderRadius: 3,
  },
  actionTagText: {
    fontSize: 6.5,
    fontWeight: '800',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },

  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 14 },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: RADIUS.md, padding: 16, maxHeight: '85%' },
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
  dateRow: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 4 },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 2,
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  durationBadgeText: {
    fontSize: 10,
    color: '#0369A1',
    fontWeight: '700',
  },
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
