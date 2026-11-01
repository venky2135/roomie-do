import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { fetchTasks, logTask } from '../../lib/api';
import { useAuthStore } from '../../store/useAuthStore';
import { useHouseStore, TaskTemplate } from '../../store/useHouseStore';
import { COLORS, FONTS, SPACING, RADIUS, CATEGORY_COLORS } from '../../constants/theme';

export default function TasksScreen() {
  const { profile, refreshProfile } = useAuthStore();
  const { tasks, setTasks } = useHouseStore();
  const [loading, setLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskTemplate | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (profile?.house_id) loadTasks();
  }, [profile?.house_id]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const res = await fetchTasks(profile!.house_id!);
      setTasks(res.data.tasks);
    } catch (e) {
      Alert.alert('Error', 'Could not load tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleLogTask = async () => {
    if (!selectedTask) return;
    setSubmitting(true);
    try {
      const res = await logTask({ taskId: selectedTask.id, notes });
      const { credits } = res.data;
      setSuccessMsg(`+${credits.creditsAwarded} credits awarded! ${credits.streakBonus ? '🔥 Streak bonus!' : ''}`);
      setNotes('');
      setTimeout(() => {
        setSelectedTask(null);
        setSuccessMsg('');
        refreshProfile();
      }, 2000);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error ?? 'Failed to log task');
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
      <Text style={styles.title}>Log a Chore</Text>
      <Text style={styles.sub}>Tap a task to mark it done and earn credits!</Text>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {Object.entries(grouped).map(([category, categoryTasks]) => (
            <View key={category} style={styles.categorySection}>
              <View style={[styles.categoryBadge, { backgroundColor: CATEGORY_COLORS[category] ?? COLORS.primary }]}>
                <Text style={styles.categoryText}>{category}</Text>
              </View>
              {categoryTasks.map((task) => (
                <TouchableOpacity
                  key={task.id}
                  style={styles.taskCard}
                  onPress={() => setSelectedTask(task)}
                >
                  <Text style={styles.taskIcon}>{task.icon}</Text>
                  <View style={styles.taskInfo}>
                    <Text style={styles.taskName}>{task.name}</Text>
                    <Text style={styles.taskCredits}>Base: {task.base_credits} credits</Text>
                  </View>
                  <Text style={styles.logBtn}>Log →</Text>
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
                <Text style={styles.successEmoji}>🎉</Text>
                <Text style={styles.successText}>{successMsg}</Text>
              </View>
            ) : (
              <>
                <Text style={styles.modalTitle}>{selectedTask?.icon} {selectedTask?.name}</Text>
                <Text style={styles.modalCredits}>Base credits: {selectedTask?.base_credits}</Text>

                <TextInput
                  style={styles.notesInput}
                  placeholder="Add a note (optional)"
                  placeholderTextColor={COLORS.textLight}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                />

                <TouchableOpacity
                  style={[styles.confirmBtn, submitting && { opacity: 0.6 }]}
                  onPress={handleLogTask}
                  disabled={submitting}
                >
                  <Text style={styles.confirmBtnText}>
                    {submitting ? 'Logging...' : '✅ Mark as Done'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setSelectedTask(null)}>
                  <Text style={styles.cancelText}>Cancel</Text>
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
  container: { flex: 1, backgroundColor: COLORS.background, paddingTop: SPACING.xl + 16, paddingHorizontal: SPACING.md },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: '800', color: COLORS.text },
  sub: { color: COLORS.textSecondary, marginBottom: SPACING.lg, marginTop: 4 },
  categorySection: { marginBottom: SPACING.md },
  categoryBadge: {
    paddingHorizontal: SPACING.sm, paddingVertical: 4,
    borderRadius: RADIUS.full, alignSelf: 'flex-start', marginBottom: SPACING.xs,
  },
  categoryText: { color: '#FFF', fontWeight: '700', fontSize: FONTS.sizes.sm },
  taskCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card,
    borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.xs,
    elevation: 1,
  },
  taskIcon: { fontSize: 28, marginRight: SPACING.sm },
  taskInfo: { flex: 1 },
  taskName: { fontSize: FONTS.sizes.base, fontWeight: '600', color: COLORS.text },
  taskCredits: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
  logBtn: { color: COLORS.primary, fontWeight: '700', fontSize: FONTS.sizes.base },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: SPACING.xl,
  },
  modalTitle: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  modalCredits: { color: COLORS.primary, fontWeight: '600', marginBottom: SPACING.md },
  notesInput: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    padding: SPACING.md, color: COLORS.text, minHeight: 80, marginBottom: SPACING.md,
  },
  confirmBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
    paddingVertical: SPACING.md, alignItems: 'center', marginBottom: SPACING.sm,
  },
  confirmBtnText: { color: '#FFF', fontWeight: '700', fontSize: FONTS.sizes.md },
  cancelText: { textAlign: 'center', color: COLORS.textSecondary, padding: SPACING.sm },
  successBox: { alignItems: 'center', paddingVertical: SPACING.xl },
  successEmoji: { fontSize: 56, marginBottom: SPACING.md },
  successText: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.primary, textAlign: 'center' },
});

