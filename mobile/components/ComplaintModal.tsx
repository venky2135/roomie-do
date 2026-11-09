import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabaseAdmin } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { submitAnonymousComplaint } from '../lib/complaintWorkflow';
import { COLORS, RADIUS } from '../constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface Roommate {
  id: string;
  username: string;
  avatar_url: string | null;
  streak_days: number;
}

const CATEGORIES = [
  { id: 'dishes', label: 'Dishes & Kitchen', icon: 'restaurant-outline' },
  { id: 'noise', label: 'Noise & Music', icon: 'volume-high-outline' },
  { id: 'mess', label: 'Mess & Chores', icon: 'trash-outline' },
  { id: 'bathroom', label: 'Bathroom Care', icon: 'water-outline' },
  { id: 'night', label: 'Late Night Disruption', icon: 'moon-outline' },
  { id: 'borrowed', label: 'Borrowed Without Asking', icon: 'cube-outline' },
  { id: 'other', label: 'Other Issue', icon: 'alert-circle-outline' },
];

export default function ComplaintModal({ visible, onClose, onSuccess }: Props) {
  const { profile } = useAuthStore();
  const [roommates, setRoommates] = useState<Roommate[]>([]);
  const [loadingRoommates, setLoadingRoommates] = useState(false);

  const [selectedAccused, setSelectedAccused] = useState<Roommate | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0].label);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Fetch house roommates (excluding current user)
  useEffect(() => {
    if (!visible || !profile?.house_id) return;

    const fetchRoommates = async () => {
      setLoadingRoommates(true);
      try {
        const { data, error } = await supabaseAdmin
          .from('profiles')
          .select('id, username, avatar_url, streak_days')
          .eq('house_id', profile.house_id);

        if (!error && data) {
          // Filter out self
          const others = data.filter((m) => m.id !== profile.id);
          setRoommates(others);
          if (others.length > 0 && !selectedAccused) {
            setSelectedAccused(others[0]);
          }
        }
      } catch (e) {
        console.warn('Failed to load roommates for complaint:', e);
      } finally {
        setLoadingRoommates(false);
      }
    };

    fetchRoommates();
  }, [visible, profile?.house_id, profile?.id]);

  const resetForm = () => {
    setTitle('');
    setDetails('');
    setSelectedCategory(CATEGORIES[0].label);
  };

  const handleSubmit = async () => {
    if (!profile?.id || !profile?.house_id) return;

    if (!selectedAccused) {
      const msg = 'Please select a roommate to raise the complaint against.';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Required', msg);
      return;
    }

    if (!title.trim()) {
      const msg = 'Please describe the issue or complaint.';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Required', msg);
      return;
    }

    const totalHouseMembers = roommates.length + 1; // including self

    const performSubmit = async () => {
      setSubmitting(true);
      const res = await submitAnonymousComplaint({
        reporterId: profile.id,
        houseId: profile.house_id!,
        accusedId: selectedAccused.id,
        accusedUsername: selectedAccused.username,
        accusedAvatar: selectedAccused.avatar_url || '🧑',
        category: selectedCategory,
        title: title.trim(),
        details: details.trim(),
        totalMembers: totalHouseMembers,
      });
      setSubmitting(false);

      if (res.success) {
        resetForm();
        onClose();
        if (onSuccess) onSuccess();
        const successMsg =
          'Anonymous complaint posted to the Feed. If other roommates upvote it, the accused will lose 10 streaks.';
        if (Platform.OS === 'web') alert(successMsg);
        else Alert.alert('Complaint Raised 🤫', successMsg);
      } else {
        const errMsg = res.error || 'Failed to submit complaint';
        if (Platform.OS === 'web') alert(errMsg);
        else Alert.alert('Error', errMsg);
      }
    };

    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined'
          ? window.confirm(
              `Submit anonymous complaint against ${selectedAccused.username}? If other roommates upvote it, ${selectedAccused.username} will lose 10 streaks.`
            )
          : true;
      if (confirmed) performSubmit();
    } else {
      Alert.alert(
        'Submit Anonymous Complaint',
        `Submit complaint against ${selectedAccused.username}? If other roommates upvote it, they will receive -10 streaks. Your identity is 100% anonymous.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Submit Anonymously', style: 'destructive', onPress: performSubmit },
        ]
      );
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleRow}>
              <View style={styles.iconCircleHeader}>
                <Ionicons name="alert-circle" size={18} color="#E11D48" />
              </View>
              <View>
                <Text style={styles.modalTitle}>Anonymous Complaint</Text>
                <Text style={styles.modalSubHeader}>100% anonymous report</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Privacy Assurance Banner */}
            <View style={styles.privacyBanner}>
              <Ionicons name="shield-checkmark" size={16} color="#0D9488" />
              <Text style={styles.privacyBannerText}>
                <Text style={styles.privacyBold}>Your identity is strictly hidden.</Text> Only the complaint and
                the accused roommate will be visible in the activity feed.
              </Text>
            </View>

            {/* Roommate Selection */}
            <Text style={styles.inputLabel}>Select Accused Roommate *</Text>
            {loadingRoommates ? (
              <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 10 }} />
            ) : roommates.length === 0 ? (
              <View style={styles.emptyRoommatesBox}>
                <Ionicons name="people-outline" size={24} color="#94A3B8" />
                <Text style={styles.emptyRoommatesText}>
                  No other roommates found in your house. Invite housemates first!
                </Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roommateList}>
                {roommates.map((rm) => {
                  const isSelected = selectedAccused?.id === rm.id;
                  return (
                    <TouchableOpacity
                      key={rm.id}
                      style={[styles.roommateCard, isSelected && styles.roommateCardSelected]}
                      onPress={() => setSelectedAccused(rm)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.avatarWrapper}>
                        <Text style={styles.roommateAvatar}>{rm.avatar_url || '🧑'}</Text>
                        {isSelected && (
                          <View style={styles.checkCircle}>
                            <Ionicons name="checkmark" size={10} color="#FFF" />
                          </View>
                        )}
                      </View>
                      <Text style={[styles.roommateName, isSelected && styles.roommateNameSelected]} numberOfLines={1}>
                        {rm.username}
                      </Text>
                      <View style={styles.roommateStreakBadge}>
                        <Ionicons name="flame" size={10} color={COLORS.accent} />
                        <Text style={styles.roommateStreakText}>{rm.streak_days}d</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Issue Category Chips */}
            <Text style={styles.inputLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat.label;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                    onPress={() => setSelectedCategory(cat.label)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={cat.icon as any}
                      size={12}
                      color={isSelected ? '#FFF' : '#64748B'}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextSelected]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Complaint Reason / Title */}
            <Text style={styles.inputLabel}>Complaint / What Happened? *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Left dirty dishes & food in the sink overnight"
              placeholderTextColor="#94A3B8"
              value={title}
              onChangeText={setTitle}
              maxLength={120}
            />

            {/* Additional Details (Optional) */}
            <Text style={styles.inputLabel}>Additional Details (Optional)</Text>
            <TextInput
              style={[styles.modalInput, styles.textArea]}
              placeholder="Add more details so roommates can verify and upvote..."
              placeholderTextColor="#94A3B8"
              value={details}
              onChangeText={setDetails}
              multiline
              numberOfLines={3}
              maxLength={300}
            />

            {/* Penalty Rule Card */}
            <View style={styles.penaltyCard}>
              <View style={styles.penaltyHeader}>
                <Ionicons name="flame" size={15} color="#E11D48" />
                <Text style={styles.penaltyTitle}>Penalty Rule: -10 Streaks & -10 XP</Text>
              </View>
              <Text style={styles.penaltyText}>
                When other roommates upvote this complaint, the complaint is upheld and{' '}
                <Text style={styles.penaltyBold}>
                  {selectedAccused ? `@${selectedAccused.username}` : 'the accused'} will receive -10 streaks and -10 XP
                </Text>
                . Please keep complaints constructive and fair.
              </Text>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitBtn,
                (!selectedAccused || !title.trim() || submitting) && styles.submitBtnDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!selectedAccused || !title.trim() || submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="megaphone-outline" size={16} color="#FFF" style={{ marginRight: 6 }} />
                  <Text style={styles.submitBtnText}>Raise Anonymous Complaint 🤫</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={submitting}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 14,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    padding: 16,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconCircleHeader: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFE4E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1A1A24',
  },
  modalSubHeader: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
  },
  privacyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 4,
    marginBottom: 8,
  },
  privacyBannerText: {
    fontSize: 10,
    color: '#0F766E',
    flex: 1,
    lineHeight: 14,
  },
  privacyBold: {
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 4,
    marginTop: 8,
  },
  roommateList: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  roommateCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginRight: 8,
    minWidth: 80,
  },
  roommateCardSelected: {
    backgroundColor: '#FFF1F2',
    borderColor: '#E11D48',
    borderWidth: 1.5,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 4,
  },
  roommateAvatar: {
    fontSize: 24,
  },
  checkCircle: {
    position: 'absolute',
    bottom: -2,
    right: -4,
    backgroundColor: '#E11D48',
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roommateName: {
    fontSize: 10,
    fontWeight: '600',
    color: '#334155',
    maxWidth: 70,
  },
  roommateNameSelected: {
    fontWeight: '800',
    color: '#E11D48',
  },
  roommateStreakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  roommateStreakText: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '600',
  },
  emptyRoommatesBox: {
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  emptyRoommatesText: {
    fontSize: 10,
    color: '#64748B',
    textAlign: 'center',
  },
  categoryScroll: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryChipSelected: {
    backgroundColor: '#E11D48',
    borderColor: '#E11D48',
  },
  categoryChipText: {
    fontSize: 10,
    color: '#475569',
    fontWeight: '600',
  },
  categoryChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 11,
    color: '#1A1A24',
    marginBottom: 4,
  },
  textArea: {
    height: 60,
    textAlignVertical: 'top',
  },
  penaltyCard: {
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    marginBottom: 10,
  },
  penaltyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 3,
  },
  penaltyTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#BE123C',
  },
  penaltyText: {
    fontSize: 10,
    color: '#9F1239',
    lineHeight: 14,
  },
  penaltyBold: {
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: '#E11D48',
    borderRadius: 8,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cancelBtn: {
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 2,
  },
  cancelBtnText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
});

