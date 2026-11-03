import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Image,
  ScrollView,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuthStore } from '../../store/useAuthStore';
import { COLORS, RADIUS } from '../../constants/theme';
import AppIcon from '../../components/AppIcon';
import { supabase } from '../../lib/supabase';
import { fetchTasks } from '../../lib/api';
import { TaskTemplate } from '../../store/useHouseStore';
import {
  fetchMarketplaceTasks,
  createMarketplaceTask,
  claimMarketplaceTask,
  completeMarketplaceTask,
  MarketplaceTask,
} from '../../lib/taskWorkflow';
import { pickImage, uploadTaskPhoto } from '../../lib/photoUpload';

export default function MarketplaceScreen() {
  const { profile, refreshProfile } = useAuthStore();
  const [tasks, setTasks] = useState<MarketplaceTask[]>([]);
  const [adminTemplates, setAdminTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'claimed'>('all');

  // Add Task Modal State (Picker from Admin Tasks)
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);
  const [customBounty, setCustomBounty] = useState('');
  const [taskNote, setTaskNote] = useState('');
  const [addingTask, setAddingTask] = useState(false);

  // Complete Modal State
  const [completingTask, setCompletingTask] = useState<MarketplaceTask | null>(null);
  const [completeNotes, setCompleteNotes] = useState('');
  const [completePhotoUri, setCompletePhotoUri] = useState<string | null>(null);
  const [submittingComplete, setSubmittingComplete] = useState(false);

  const loadData = useCallback(async () => {
    if (!profile?.house_id) return;
    setLoading(true);
    try {
      const marketData = await fetchMarketplaceTasks(profile.house_id);
      setTasks(marketData);

      // Load admin task templates (backend API with direct Supabase fallback)
      let regularTemplates: TaskTemplate[] = [];
      try {
        const templatesRes = await fetchTasks(profile.house_id);
        regularTemplates = (templatesRes.data?.tasks || []).filter(
          (t: TaskTemplate) => t.category !== 'Marketplace'
        );
      } catch {
        const { data } = await supabase
          .from('task_templates')
          .select('*')
          .eq('house_id', profile.house_id)
          .eq('is_active', true)
          .order('category');
        regularTemplates = (data || []).filter((t: any) => t.category !== 'Marketplace');
      }
      setAdminTemplates(regularTemplates);
    } catch (_) {}
    setLoading(false);
  }, [profile?.house_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadData(), refreshProfile()]);
    setRefreshing(false);
  };

  const handleSelectTemplate = (template: TaskTemplate) => {
    setSelectedTemplate(template);
    setCustomBounty(String(template.base_credits || 25));
  };

  const handlePostFromAdminTask = async () => {
    if (!selectedTemplate) {
      Alert.alert('Select a Task', 'Please tap a task from the list below to add it.');
      return;
    }

    const bounty = parseInt(customBounty, 10) || selectedTemplate.base_credits || 25;
    setAddingTask(true);
    const res = await createMarketplaceTask({
      houseId: profile!.house_id!,
      title: selectedTemplate.name,
      description: taskNote.trim() || `Assigned chore: ${selectedTemplate.name}`,
      bountyXp: bounty,
      userId: profile!.id,
      username: profile!.username,
    });
    setAddingTask(false);

    if (res.success) {
      setShowAddModal(false);
      setSelectedTemplate(null);
      setTaskNote('');
      loadData();
    } else {
      Alert.alert('Error', res.error || 'Failed to add task to marketplace.');
    }
  };

  const handleClaim = async (task: MarketplaceTask) => {
    if (!profile?.id) return;

    const executeClaim = async () => {
      // Optimistically update state so the card immediately shows "Claimed by You"
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? {
                ...t,
                status: 'claimed',
                claimedBy: profile.id,
                claimedByName: profile.username,
              }
            : t
        )
      );

      const res = await claimMarketplaceTask(task.id, profile.id, profile.username);
      if (res.success) {
        if (Platform.OS === 'web') {
          // Native browser alert
          alert(`Claimed "${task.title}"! Tap 'Submit Proof' when you finish.`);
        } else {
          Alert.alert('Claimed', 'Task claimed! Submit proof once done to get verified.');
        }
        loadData();
      } else {
        if (Platform.OS === 'web') {
          alert(res.error || 'Failed to claim task.');
        } else {
          Alert.alert('Error', res.error || 'Failed to claim task.');
        }
        loadData();
      }
    };

    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined'
          ? window.confirm(`Claim "${task.title}" for ${task.bountyXp} XP?`)
          : true;
      if (confirmed) {
        await executeClaim();
      }
    } else {
      Alert.alert('Claim Chore', `Claim "${task.title}" for ${task.bountyXp} XP?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Claim', onPress: executeClaim },
      ]);
    }
  };

  const handlePickPhoto = async (fromCamera: boolean) => {
    const uri = await pickImage(fromCamera);
    if (uri) {
      setCompletePhotoUri(uri);
    }
  };

  const handleSubmitCompletion = async () => {
    if (!completingTask) return;
    setSubmittingComplete(true);

    let uploadedUrl: string | undefined = undefined;
    if (completePhotoUri) {
      uploadedUrl = (await uploadTaskPhoto(completePhotoUri)) || undefined;
    }

    const res = await completeMarketplaceTask(
      completingTask.id,
      profile!.id,
      completeNotes.trim(),
      uploadedUrl
    );

    setSubmittingComplete(false);

    if (res.success) {
      if (Platform.OS === 'web') {
        alert('Submitted for roommate verification! XP will be awarded upon approval.');
      } else {
        Alert.alert('Submitted', 'Submitted for roommate verification. XP awarded upon approval.');
      }
      setCompletingTask(null);
      setCompleteNotes('');
      setCompletePhotoUri(null);
      loadData();
      refreshProfile();
    } else {
      if (Platform.OS === 'web') {
        alert(res.error || 'Failed to complete task.');
      } else {
        Alert.alert('Error', res.error || 'Failed to complete task.');
      }
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'open') return t.status === 'open';
    if (filter === 'claimed') return t.status === 'claimed' && t.claimedBy === profile?.id;
    return true;
  });

  return (
    <View style={styles.container}>
      {/* Minimal Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Marketplace</Text>
          <Text style={styles.sub}>Claim chores or add tasks for roommates</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
          <Ionicons name="add" size={14} color="#FFF" />
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(['all', 'open', 'claimed'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.filterChip, filter === tab && styles.filterChipActive]}
            onPress={() => setFilter(tab)}
          >
            <Text style={[styles.filterChipText, filter === tab && styles.filterChipTextActive]}>
              {tab === 'all' ? 'All' : tab === 'open' ? 'Open' : 'Mine'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator color={COLORS.primary} size="small" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={filteredTasks}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Ionicons name="storefront-outline" size={28} color="#B0BEC5" />
              <Text style={styles.emptyTitle}>No chores in marketplace</Text>
              <Text style={styles.emptySub}>Tap 'Add' to pick an admin chore and post it with XP reward.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isCreator = item.createdBy === profile?.id;
            const isClaimer = item.claimedBy === profile?.id;
            const isOpen = item.status === 'open';

            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.titleArea}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardBy}>Posted by {item.createdByName}</Text>
                  </View>
                  <View style={styles.bountyBadge}>
                    <Ionicons name="flash" size={10} color={COLORS.primary} />
                    <Text style={styles.bountyVal}>+{item.bountyXp} XP</Text>
                  </View>
                </View>

                {item.description ? <Text style={styles.cardDesc}>{item.description}</Text> : null}

                <View style={styles.cardFooter}>
                  <View style={styles.statusBox}>
                    <Ionicons
                      name={
                        isOpen
                          ? 'radio-button-on'
                          : item.status === 'claimed'
                          ? 'time-outline'
                          : 'checkmark-circle'
                      }
                      size={12}
                      color={isOpen ? COLORS.success : item.status === 'claimed' ? COLORS.accent : COLORS.primary}
                    />
                    <Text style={styles.statusLabel}>
                      {isOpen
                        ? 'Open'
                        : item.status === 'claimed'
                        ? `Claimed by ${isClaimer ? 'You' : item.claimedByName}`
                        : 'Done'}
                    </Text>
                  </View>

                  {isOpen && (
                    <TouchableOpacity style={styles.claimPill} onPress={() => handleClaim(item)}>
                      <Ionicons name="hand-right-outline" size={11} color="#FFF" style={{ marginRight: 2 }} />
                      <Text style={styles.claimPillText}>Claim</Text>
                    </TouchableOpacity>
                  )}

                  {item.status === 'claimed' && isClaimer && (
                    <TouchableOpacity style={styles.completePill} onPress={() => setCompletingTask(item)}>
                      <Ionicons name="camera-outline" size={12} color="#FFF" />
                      <Text style={styles.completePillText}>Submit Proof</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}

      {/* ─── Modal: Pick an Admin Task to Add to Marketplace ─── */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalTopBar}>
              <Text style={styles.modalHead}>Add Task to Marketplace</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={20} color="#7E7E8F" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>Choose from the tasks added by your house admin:</Text>

            {/* List of Admin Task Templates */}
            <ScrollView style={styles.templateList} showsVerticalScrollIndicator={false}>
              {adminTemplates.length === 0 ? (
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <Ionicons name="clipboard-outline" size={24} color="#B0BEC5" />
                  <Text style={{ fontSize: 11, color: '#7E7E8F', marginTop: 6, textAlign: 'center' }}>
                    No admin chore templates available yet.
                  </Text>
                </View>
              ) : (
                adminTemplates.map((template) => {
                  const isSelected = selectedTemplate?.id === template.id;
                  return (
                    <TouchableOpacity
                      key={template.id}
                      style={[styles.templateItem, isSelected && styles.templateItemSelected]}
                      onPress={() => handleSelectTemplate(template)}
                    >
                      <View style={styles.templateIcon}>
                        <AppIcon name={template.icon} category={template.category} size={18} color={COLORS.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.templateName, isSelected && styles.templateNameSelected]}>
                          {template.name}
                        </Text>
                        <Text style={styles.templateCat}>{template.category} · Base: {template.base_credits} XP</Text>
                      </View>
                      {isSelected ? (
                        <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                      ) : (
                        <Ionicons name="chevron-forward" size={14} color="#B0BEC5" />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            {/* Configuration for Selected Task */}
            {selectedTemplate && (
              <View style={styles.selectedConfigBox}>
                <View style={styles.bountyRow}>
                  <Text style={styles.fieldLabel}>XP Bounty:</Text>
                  <TextInput
                    style={styles.bountyInput}
                    keyboardType="numeric"
                    value={customBounty}
                    onChangeText={setCustomBounty}
                  />
                  <Text style={styles.xpSuffix}>XP</Text>
                </View>

                <TextInput
                  style={styles.noteInput}
                  placeholder="Optional note / instructions..."
                  placeholderTextColor="#A0A0B0"
                  value={taskNote}
                  onChangeText={setTaskNote}
                />
              </View>
            )}

            <TouchableOpacity
              style={[styles.postSubmitBtn, (!selectedTemplate || addingTask) && { opacity: 0.5 }]}
              onPress={handlePostFromAdminTask}
              disabled={!selectedTemplate || addingTask}
            >
              <Text style={styles.postSubmitText}>
                {addingTask ? 'Posting...' : selectedTemplate ? `Post "${selectedTemplate.name}"` : 'Select a Task Above'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── Modal: Submit Task Completion & Photo Proof ─── */}
      <Modal visible={!!completingTask} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalTopBar}>
              <Text style={styles.modalHead}>Complete Chore</Text>
              <TouchableOpacity onPress={() => setCompletingTask(null)}>
                <Ionicons name="close" size={20} color="#7E7E8F" />
              </TouchableOpacity>
            </View>

            <Text style={styles.taskTitleMini}>{completingTask?.title}</Text>
            <Text style={styles.taskBountyMini}>Reward: +{completingTask?.bountyXp} XP upon verification</Text>

            <TextInput
              style={styles.noteInput}
              placeholder="Add completion note (optional)..."
              placeholderTextColor="#A0A0B0"
              value={completeNotes}
              onChangeText={setCompleteNotes}
            />

            {/* Photo Proof */}
            <Text style={styles.fieldLabel}>Photo Proof:</Text>
            {completePhotoUri ? (
              <View style={styles.photoBox}>
                <Image source={{ uri: completePhotoUri }} style={styles.photoImg} />
                <TouchableOpacity style={styles.photoDel} onPress={() => setCompletePhotoUri(null)}>
                  <Ionicons name="trash" size={14} color="#FFF" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.photoBtns}>
                <TouchableOpacity style={styles.photoBtn} onPress={() => handlePickPhoto(true)}>
                  <Ionicons name="camera-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.photoBtnText}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoBtn} onPress={() => handlePickPhoto(false)}>
                  <Ionicons name="images-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.photoBtnText}>Gallery</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={[styles.postSubmitBtn, submittingComplete && { opacity: 0.5 }]}
              onPress={handleSubmitCompletion}
              disabled={submittingComplete}
            >
              <Text style={styles.postSubmitText}>
                {submittingComplete ? 'Submitting...' : 'Submit for Verification'}
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 16, fontWeight: '800', color: '#1A1A24' },
  sub: { fontSize: 11, color: '#7E7E8F', marginTop: 1 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    gap: 3,
  },
  addBtnText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  filterRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECEC',
  },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText: { fontSize: 10, color: '#7E7E8F', fontWeight: '600' },
  filterChipTextActive: { color: '#FFF', fontWeight: '700' },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.sm,
    padding: 24,
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
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#ECECEC',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  titleArea: { flex: 1, marginRight: 8 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#1A1A24' },
  cardBy: { fontSize: 10, color: '#9090A0', marginTop: 1 },
  bountyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    gap: 2,
  },
  bountyVal: { fontSize: 10, fontWeight: '800', color: COLORS.primary },
  cardDesc: { fontSize: 11, color: '#4A4A5A', marginTop: 4, lineHeight: 15 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F2',
  },
  statusBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusLabel: { fontSize: 10, color: '#7E7E8F', fontWeight: '500' },
  claimPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  claimPillText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  completePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    gap: 3,
  },
  completePillText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: RADIUS.md,
    borderTopRightRadius: RADIUS.md,
    padding: 14,
    maxHeight: '85%',
  },
  modalTopBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalHead: { fontSize: 14, fontWeight: '800', color: '#1A1A24' },
  modalHint: { fontSize: 11, color: '#7E7E8F', marginBottom: 8 },
  templateList: { maxHeight: 240, marginBottom: 8 },
  templateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: '#F0F0F2',
    marginBottom: 4,
    gap: 8,
  },
  templateItemSelected: {
    backgroundColor: '#E8F5E9',
    borderColor: COLORS.primary,
  },
  templateIcon: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.sm,
    backgroundColor: '#F5F5F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateName: { fontSize: 12, fontWeight: '600', color: '#1A1A24' },
  templateNameSelected: { color: COLORS.primary, fontWeight: '700' },
  templateCat: { fontSize: 9, color: '#9090A0', marginTop: 1 },
  selectedConfigBox: {
    backgroundColor: '#F9F9FB',
    borderRadius: RADIUS.sm,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ECECEC',
  },
  bountyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: '#7E7E8F' },
  bountyInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECEC',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    width: 60,
    textAlign: 'center',
  },
  xpSuffix: { fontSize: 10, color: '#7E7E8F', fontWeight: '600' },
  noteInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECEC',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 11,
    color: '#1A1A24',
  },
  postSubmitBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingVertical: 9,
    alignItems: 'center',
    marginTop: 4,
  },
  postSubmitText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  taskTitleMini: { fontSize: 13, fontWeight: '700', color: '#1A1A24' },
  taskBountyMini: { fontSize: 11, color: COLORS.primary, fontWeight: '600', marginBottom: 8 },
  photoBox: { position: 'relative', marginTop: 4, borderRadius: 4, overflow: 'hidden' },
  photoImg: { width: '100%', height: 130, borderRadius: 4 },
  photoDel: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, padding: 4 },
  photoBtns: { flexDirection: 'row', gap: 6, marginTop: 4, marginBottom: 8 },
  photoBtn: {
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
  photoBtnText: { fontSize: 10, color: COLORS.primary, fontWeight: '600' },
});
