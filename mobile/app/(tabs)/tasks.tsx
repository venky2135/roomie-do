import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
  RefreshControl,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fetchTasks, notifyChoreLogged } from '../../lib/api';
import { supabase, supabaseAdmin } from '../../lib/supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { useHouseStore, TaskTemplate } from '../../store/useHouseStore';
import { COLORS, FONTS, SPACING, RADIUS, CATEGORY_COLORS } from '../../constants/theme';
import AppIcon from '../../components/AppIcon';
import { pickImage, uploadTaskPhoto } from '../../lib/photoUpload';
import { encodeLogNotes } from '../../lib/taskWorkflow';

export default function TasksScreen() {
  const { profile, refreshProfile } = useAuthStore();
  const { tasks, setTasks } = useHouseStore();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskTemplate | null>(null);
  const [notes, setNotes] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (profile?.house_id) loadTasks();
  }, [profile?.house_id]);

  const loadTasks = async (isRefresh = false) => {
    if (!profile?.house_id) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // 1. Fetch live directly from Supabase
      const { data, error } = await supabaseAdmin
        .from('task_templates')
        .select('*')
        .eq('house_id', profile.house_id)
        .eq('is_active', true)
        .neq('category', 'Marketplace')
        .neq('category', 'Leave')
        .neq('category', 'WeeklyStakes')
        .order('category');

      if (!error && data) {
        setTasks(data);
      } else {
        // Fallback to backend API
        const res = await fetchTasks(profile.house_id);
        const regularTasks = res.data.tasks.filter((t: TaskTemplate) => t.category !== 'Marketplace' && t.category !== 'Leave' && t.category !== 'WeeklyStakes');
        setTasks(regularTasks);
      }
    } catch (e) {
      console.warn('Could not load tasks:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handlePickPhoto = async (fromCamera: boolean) => {
    const uri = await pickImage(fromCamera);
    if (uri) {
      setPhotoUri(uri);
    }
  };

  const handleLogTask = async () => {
    if (!selectedTask || !profile?.id) return;

    // Enforce photo proof ONLY if photo_required is true
    if (selectedTask.photo_required && !photoUri) {
      const msg = 'Photo proof is required for this chore. Please take or upload a photo.';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Photo Proof Required', msg);
      return;
    }

    setSubmitting(true);
    try {
      let uploadedUrl: string | null = null;
      if (photoUri) {
        uploadedUrl = await uploadTaskPhoto(photoUri);
      }

      // Encode log notes with pending verification state
      const logMetadata = {
        note: notes.trim(),
        status: 'pending_verification' as const,
        feedbacks: [],
      };

      // Use supabaseAdmin to bypass RLS code 42501
      const { data: log, error } = await supabaseAdmin
        .from('task_logs')
        .insert({
          user_id: profile.id,
          task_id: selectedTask.id,
          credits_awarded: selectedTask.base_credits + (uploadedUrl ? 5 : 0),
          photo_url: uploadedUrl,
          notes: encodeLogNotes(logMetadata),
          completed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      // Broadcast push notification to housemates via backend
      notifyChoreLogged({
        taskId: selectedTask.id,
        logId: log.id,
        taskName: selectedTask.name,
      }).catch((notifyErr) => {
        console.warn('[PushNotification] Failed to broadcast chore notification:', notifyErr);
      });

      setSuccessMsg(`Logged! Waiting for 1 roommate approval to award +${selectedTask.base_credits} XP.`);
      setNotes('');
      setPhotoUri(null);

      setTimeout(() => {
        setSelectedTask(null);
        setSuccessMsg('');
        refreshProfile();
      }, 2000);
    } catch (e: any) {
      const errMsg = e?.message || 'Failed to log chore';
      if (Platform.OS === 'web') alert(errMsg);
      else Alert.alert('Error', errMsg);
      setSelectedTask(null);
    } finally {
      setSubmitting(false);
    }
  };

  // Group tasks by category
  const grouped = tasks.reduce((acc, task) => {
    if (!acc[task.category]) acc[task.category] = [];
    acc[task.category].push(task);
    return acc;
  }, {} as Record<string, TaskTemplate[]>);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Log a Chore</Text>
        <Text style={styles.sub}>Mark a chore done to submit it for roommate verification</Text>
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadTasks(true)}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          }
        >
          {Object.entries(grouped).map(([category, categoryTasks]) => (
            <View key={category} style={styles.categorySection}>
              <View style={[styles.categoryBadge, { backgroundColor: CATEGORY_COLORS[category] ?? COLORS.primary }]}>
                <AppIcon category={category} size={14} color="#FFF" />
                <Text style={styles.categoryText}>{category}</Text>
              </View>
              {categoryTasks.map((task) => (
                <TouchableOpacity
                  key={task.id}
                  style={styles.taskCard}
                  onPress={() => {
                    setPhotoUri(null);
                    setNotes('');
                    setSelectedTask(task);
                  }}
                >
                  <View style={styles.iconContainer}>
                    <AppIcon name={task.icon} category={task.category} size={22} color={COLORS.primary} />
                  </View>
                  <View style={styles.taskInfo}>
                    <View style={styles.taskNameRow}>
                      <Text style={styles.taskName}>{task.name}</Text>
                      {task.photo_required ? (
                        <View style={styles.photoReqTag}>
                          <Ionicons name="camera" size={10} color="#D97706" />
                          <Text style={styles.photoReqTagText}>Photo req.</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.taskCredits}>Reward: {task.base_credits} XP</Text>
                  </View>
                  <View style={styles.logPill}>
                    <Text style={styles.logBtnText}>Log</Text>
                    <Ionicons name="arrow-forward" size={14} color={COLORS.primary} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Log Task Modal */}
      <Modal visible={!!selectedTask} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {successMsg ? (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={48} color={COLORS.success} />
                <Text style={styles.successText}>{successMsg}</Text>
              </View>
            ) : (
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.modalTitleRow}>
                    <AppIcon name={selectedTask?.icon} category={selectedTask?.category} size={24} color={COLORS.primary} />
                    <Text style={styles.modalTitle}>{selectedTask?.name}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedTask(null)}>
                    <Ionicons name="close" size={24} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalCredits}>
                  Base Reward: +{selectedTask?.base_credits} XP {selectedTask?.photo_required ? '(Photo required)' : '(+5 XP with photo proof)'}
                </Text>

                <Text style={styles.inputLabel}>Notes (optional)</Text>
                <TextInput
                  style={styles.notesInput}
                  placeholder="e.g. Cleaned oven and wiped shelves"
                  placeholderTextColor={COLORS.textLight}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                />

                {/* Photo Proof Header with Status Badge */}
                <View style={styles.photoLabelRow}>
                  <Text style={styles.inputLabel}>Photo Proof</Text>
                  <View style={selectedTask?.photo_required ? styles.photoReqBadge : styles.photoOptBadge}>
                    <Ionicons
                      name={selectedTask?.photo_required ? 'alert-circle' : 'sparkles'}
                      size={11}
                      color={selectedTask?.photo_required ? '#D97706' : COLORS.primary}
                    />
                    <Text style={selectedTask?.photo_required ? styles.photoReqBadgeText : styles.photoOptBadgeText}>
                      {selectedTask?.photo_required ? 'Required *' : 'Optional (+5 XP bonus)'}
                    </Text>
                  </View>
                </View>

                {photoUri ? (
                  <View style={styles.photoPreviewBox}>
                    <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                    <TouchableOpacity style={styles.removePhotoBtn} onPress={() => setPhotoUri(null)}>
                      <Ionicons name="trash" size={16} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.photoActionsRow}>
                    <TouchableOpacity style={styles.photoActionBtn} onPress={() => handlePickPhoto(true)}>
                      <Ionicons name="camera-outline" size={20} color={COLORS.primary} />
                      <Text style={styles.photoActionText}>Take Photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.photoActionBtn} onPress={() => handlePickPhoto(false)}>
                      <Ionicons name="images-outline" size={20} color={COLORS.primary} />
                      <Text style={styles.photoActionText}>Choose from Gallery</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.confirmBtn, submitting && { opacity: 0.6 }]}
                  onPress={handleLogTask}
                  disabled={submitting}
                >
                  <Ionicons name="checkmark-done" size={20} color="#FFF" />
                  <Text style={styles.confirmBtnText}>
                    {submitting ? 'Submitting...' : 'Mark as Done'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA', paddingTop: 44, paddingHorizontal: 12 },
  header: {
    marginBottom: 8,
  },
  title: { fontSize: 16, fontWeight: '800', color: '#1A1A24' },
  sub: { fontSize: 11, color: '#7E7E8F', marginTop: 2 },
  categorySection: { marginBottom: 10 },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  categoryText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.sm,
    padding: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#ECECEC',
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#F3F8F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  taskInfo: { flex: 1 },
  taskNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  taskName: { fontSize: 12, fontWeight: '700', color: '#1A1A24' },
  photoReqTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: RADIUS.full,
    gap: 2,
  },
  photoReqTagText: { fontSize: 9, fontWeight: '700', color: '#D97706' },
  taskCredits: { fontSize: 10, color: '#7E7E8F', marginTop: 1 },
  logPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    gap: 2,
  },
  logBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: RADIUS.md,
    borderTopRightRadius: RADIUS.md,
    padding: 14,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  modalTitle: { fontSize: 14, fontWeight: '800', color: '#1A1A24' },
  modalCredits: { fontSize: 11, color: COLORS.primary, fontWeight: '700', marginBottom: 6 },
  inputLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#7E7E8F',
    textTransform: 'uppercase',
  },
  photoLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 3,
  },
  photoReqBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    gap: 3,
  },
  photoReqBadgeText: { fontSize: 9, fontWeight: '800', color: '#D97706' },
  photoOptBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    gap: 3,
  },
  photoOptBadgeText: { fontSize: 9, fontWeight: '700', color: COLORS.primary },
  notesInput: {
    backgroundColor: '#F9F9FB',
    borderWidth: 1,
    borderColor: '#ECECEC',
    borderRadius: 4,
    padding: 8,
    height: 50,
    fontSize: 11,
    color: '#1A1A24',
    marginTop: 3,
  },
  photoPreviewBox: { position: 'relative', marginTop: 4, borderRadius: 4, overflow: 'hidden' },
  photoPreview: { width: '100%', height: 130, borderRadius: 4 },
  removePhotoBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: RADIUS.full,
    padding: 4,
  },
  photoActionsRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  photoActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.primary,
    borderRadius: 4,
    paddingVertical: 8,
    gap: 4,
  },
  photoActionText: { fontSize: 10, color: COLORS.primary, fontWeight: '600' },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingVertical: 10,
    marginTop: 12,
    gap: 6,
  },
  confirmBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  successBox: { alignItems: 'center', paddingVertical: 20 },
  successText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A1A24',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
});
