import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Alert, Switch, RefreshControl, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { router } from 'expo-router';
import { fetchTasks, upsertTask, toggleTask, regenerateCode, removeMember } from '../../lib/api';
import { supabase, supabaseAdmin } from '../../lib/supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { useHouseStore, TaskTemplate, Member } from '../../store/useHouseStore';
import { COLORS, FONTS, SPACING, RADIUS, CATEGORY_COLORS } from '../../constants/theme';

const TASK_ICONS = ['🍳', '🍽️', '🧽', '🧹', '🪣', '🚿', '👕', '👔', '🛒', '🗑️', '🧺', '🪴', '🧴', '🛁', '🪟'];
const CATEGORIES = ['Kitchen', 'Cleaning', 'Laundry', 'Shopping', 'General'];

export default function AdminScreen() {
  const { profile, refreshProfile } = useAuthStore();
  const { tasks, setTasks, house, setHouse, members, setMembers } = useHouseStore();
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editTask, setEditTask] = useState<Partial<TaskTemplate> | null>(null);
  const [inviteCode, setInviteCode] = useState(house?.invite_code ?? '');

  const loadAll = async () => {
    if (!profile?.house_id) return;
    try {
      const [tasksRes, membersRes, houseRes] = await Promise.all([
        supabaseAdmin
          .from('task_templates')
          .select('*')
          .eq('house_id', profile.house_id)
          .neq('category', 'Marketplace')
          .neq('category', 'Leave')
          .neq('category', 'WeeklyStakes')
          .order('category'),
        supabaseAdmin.from('profiles').select('*').eq('house_id', profile.house_id),
        supabaseAdmin.from('houses').select('*').eq('id', profile.house_id).single(),
      ]);
      if (tasksRes.data) setTasks(tasksRes.data as TaskTemplate[]);
      if (membersRes.data) setMembers(membersRes.data as Member[]);
      if (houseRes.data) {
        setHouse(houseRes.data);
        setInviteCode(houseRes.data.invite_code);
      }
    } catch (err) {
      console.warn('Error loading admin panel data:', err);
    }
  };

  const onRefresh = async () => { setRefreshing(true); await loadAll(); setRefreshing(false); };
  useEffect(() => { loadAll(); }, []);

  const openAddTask = () => {
    setEditTask({ name: '', icon: '🧹', category: 'General', base_credits: 20, photo_required: false });
    setModalVisible(true);
  };

  const openEditTask = (task: TaskTemplate) => {
    setEditTask({ ...task });
    setModalVisible(true);
  };

  const handleSaveTask = async () => {
    if (!editTask?.name?.trim()) {
      if (Platform.OS === 'web') alert('Task name is required');
      else Alert.alert('Error', 'Task name is required');
      return;
    }
    try {
      const payload = {
        house_id: profile!.house_id!,
        name: editTask.name!.trim(),
        icon: editTask.icon ?? '🧹',
        category: editTask.category ?? 'General',
        base_credits: Number(editTask.base_credits) || 20,
        photo_required: !!editTask.photo_required,
        is_active: editTask.is_active ?? true,
      };

      if (editTask.id) {
        const { error } = await supabaseAdmin
          .from('task_templates')
          .update(payload)
          .eq('id', editTask.id);
        if (error) throw error;
      } else {
        const { error } = await supabaseAdmin
          .from('task_templates')
          .insert(payload);
        if (error) throw error;
      }

      setModalVisible(false);
      await loadAll();
    } catch (e: any) {
      const msg = e?.message || 'Save failed';
      if (Platform.OS === 'web') alert('Error: ' + msg);
      else Alert.alert('Error', msg);
    }
  };

  const handleToggleTask = async (taskId: string) => {
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;
    try {
      await supabaseAdmin
        .from('task_templates')
        .update({ is_active: !target.is_active })
        .eq('id', taskId);
      await loadAll();
    } catch (err: any) {
      console.warn('Toggle failed:', err);
    }
  };

  const handleRegenerateCode = async () => {
    const doRegenerate = async () => {
      try {
        const res = await regenerateCode();
        if (res.data?.inviteCode) {
          setInviteCode(res.data.inviteCode);
          if (house) setHouse({ ...house, invite_code: res.data.inviteCode });
        }
      } catch (err: any) {
        const msg = err.response?.data?.error || err.message || 'Failed to regenerate code';
        if (Platform.OS === 'web') {
          window.alert('Error: ' + msg);
        } else {
          Alert.alert('Error', msg);
        }
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Old code will stop working. Continue?')) {
        await doRegenerate();
      }
    } else {
      Alert.alert('Regenerate Code', 'Old code will stop working. Continue?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Regenerate', style: 'destructive', onPress: doRegenerate },
      ]);
    }
  };

  const handleRemoveMember = (member: Member) => {
    if (member.id === profile?.id) {
      if (Platform.OS === 'web') window.alert('Cannot remove yourself');
      else Alert.alert('Error', 'Cannot remove yourself');
      return;
    }
    const doRemove = async () => {
      try {
        await removeMember(member.id);
        await loadAll();
      } catch (err: any) {
        const msg = err.response?.data?.error || err.message || 'Failed to remove member';
        if (Platform.OS === 'web') window.alert('Error: ' + msg);
        else Alert.alert('Error', msg);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Remove ${member.username} from the house?`)) {
        doRemove();
      }
    } else {
      Alert.alert('Remove Member', `Remove ${member.username} from the house?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doRemove },
      ]);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>⚙️ Admin Panel</Text>

      {/* Invite Code */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🔑 Invite Code</Text>
        <Text style={styles.code}>{inviteCode || house?.invite_code || '------'}</Text>
        <TouchableOpacity style={styles.regenBtn} onPress={handleRegenerateCode}>
          <Text style={styles.regenText}>Regenerate Code</Text>
        </TouchableOpacity>
      </View>

      {/* Tasks */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>📋 Tasks</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAddTask}>
          <Text style={styles.addBtnText}>+ Add Task</Text>
        </TouchableOpacity>
      </View>

      {tasks.map((task) => (
        <View key={task.id} style={styles.taskRow}>
          <Text style={styles.taskIcon}>{task.icon}</Text>
          <TouchableOpacity style={styles.taskInfo} onPress={() => openEditTask(task)}>
            <Text style={styles.taskName}>{task.name}</Text>
            <Text style={styles.taskMeta}>{task.category} · {task.base_credits} credits</Text>
          </TouchableOpacity>
          <Switch
            value={task.is_active}
            onValueChange={() => handleToggleTask(task.id)}
            trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
            thumbColor={task.is_active ? COLORS.primary : COLORS.textLight}
          />
        </View>
      ))}

      {/* Members */}
      <Text style={[styles.sectionTitle, { marginTop: SPACING.lg }]}>👥 Members</Text>
      {members.map((member) => (
        <View key={member.id} style={styles.memberRow}>
          <Text style={styles.memberAvatar}>{member.avatar_url}</Text>
          <View style={styles.memberInfo}>
            <Text style={styles.memberName}>{member.username} {member.is_admin ? '👑' : ''}</Text>
            <Text style={styles.memberMeta}>Lv.{member.level} · {member.total_credits} credits</Text>
          </View>
          {member.id !== profile?.id && (
            <TouchableOpacity onPress={() => handleRemoveMember(member)}>
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      {/* Task Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <ScrollView
            style={styles.modalCard}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.modalTitle}>{editTask?.id ? 'Edit Task' : 'Add Task'}</Text>

            <Text style={styles.label}>Task Name</Text>
            <TextInput
              style={styles.input}
              value={editTask?.name}
              onChangeText={(v) => setEditTask((p) => ({ ...p, name: v }))}
              placeholder="e.g. Mop floor"
              placeholderTextColor={COLORS.textLight}
            />

            <Text style={styles.label}>Icon</Text>
            <View style={styles.iconGrid}>
              {TASK_ICONS.map((icon) => (
                <TouchableOpacity
                  key={icon}
                  style={[styles.iconBtn, editTask?.icon === icon && styles.iconBtnActive]}
                  onPress={() => setEditTask((p) => ({ ...p, icon }))}
                >
                  <Text style={styles.iconEmoji}>{icon}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Category</Text>
            <View style={styles.categoryRow}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catBtn, editTask?.category === cat && { backgroundColor: CATEGORY_COLORS[cat] }]}
                  onPress={() => setEditTask((p) => ({ ...p, category: cat }))}
                >
                  <Text style={[styles.catBtnText, editTask?.category === cat && { color: '#FFF' }]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Base Credits: {editTask?.base_credits}</Text>
            <View style={styles.creditBtns}>
              {[10, 15, 20, 25, 30, 35, 40, 50].map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[styles.creditBtn, editTask?.base_credits === v && styles.creditBtnActive]}
                  onPress={() => setEditTask((p) => ({ ...p, base_credits: v }))}
                >
                  <Text style={[styles.creditBtnText, editTask?.base_credits === v && { color: '#FFF' }]}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.label}>Require Photo Proof</Text>
              <Switch
                value={editTask?.photo_required ?? false}
                onValueChange={(v) => setEditTask((p) => ({ ...p, photo_required: v }))}
                trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
                thumbColor={editTask?.photo_required ? COLORS.primary : COLORS.textLight}
              />
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveTask}>
              <Text style={styles.saveBtnText}>Save Task</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.md, paddingTop: SPACING.xl + 16, paddingBottom: 48 },
  backBtn: { marginBottom: SPACING.sm },
  backText: { color: COLORS.primary, fontWeight: '600', fontSize: FONTS.sizes.base },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.lg },
  card: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md, elevation: 1 },
  cardTitle: { fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  code: { fontSize: FONTS.sizes.xxl, fontWeight: '900', letterSpacing: 8, color: COLORS.primary, textAlign: 'center', marginVertical: SPACING.sm },
  regenBtn: { borderWidth: 1, borderColor: COLORS.error, borderRadius: RADIUS.md, padding: SPACING.sm, alignItems: 'center' },
  regenText: { color: COLORS.error, fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  sectionTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  addBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2 },
  addBtnText: { color: '#FFF', fontWeight: '700', fontSize: FONTS.sizes.sm },
  taskRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.xs, elevation: 1 },
  taskIcon: { fontSize: 24, marginRight: SPACING.sm },
  taskInfo: { flex: 1 },
  taskName: { fontWeight: '600', color: COLORS.text },
  taskMeta: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  memberRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.xs, elevation: 1 },
  memberAvatar: { fontSize: 28, marginRight: SPACING.sm },
  memberInfo: { flex: 1 },
  memberName: { fontWeight: '600', color: COLORS.text },
  memberMeta: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  removeText: { color: COLORS.error, fontWeight: '600', fontSize: FONTS.sizes.sm },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.xl, maxHeight: '90%' },
  modalTitle: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.md },
  label: { fontWeight: '600', color: COLORS.textSecondary, marginBottom: 4, marginTop: SPACING.sm },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md, color: COLORS.text, marginBottom: SPACING.sm },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginBottom: SPACING.sm },
  iconBtn: { width: 44, height: 44, borderRadius: RADIUS.sm, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  iconBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  iconEmoji: { fontSize: 22 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginBottom: SPACING.sm },
  catBtn: { paddingHorizontal: SPACING.sm, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border },
  catBtnText: { fontWeight: '600', color: COLORS.textSecondary, fontSize: FONTS.sizes.sm },
  creditBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginBottom: SPACING.sm },
  creditBtn: { width: 52, height: 36, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  creditBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  creditBtnText: { fontWeight: '700', color: COLORS.text },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: SPACING.sm },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: SPACING.md, alignItems: 'center', marginTop: SPACING.md },
  saveBtnText: { color: '#FFF', fontWeight: '700', fontSize: FONTS.sizes.md },
  cancelText: { textAlign: 'center', color: COLORS.textSecondary, padding: SPACING.md },
});

