import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  Alert,
  ActivityIndicator,
  Platform,
  RefreshControl,
  Keyboard,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase, supabaseAdmin } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { useGroceryStore, GroceryItem } from '../store/useGroceryStore';
import { COLORS, RADIUS } from '../constants/theme';

// Quick emoji picker options
const EMOJI_OPTIONS = ['🛒', '🥛', '🥚', '🍞', '🧃', '🥦', '🍅', '🧄', '🫙', '🧽', '🧻', '☕', '🍌', '🧈', '🍗'];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function GroceryListModal({ visible, onClose }: Props) {
  const { profile } = useAuthStore();
  const { items, setItems, addItem, updateItem, removeItem } = useGroceryStore();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemQty, setItemQty] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('🛒');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showChecked, setShowChecked] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ─── Load items ───────────────────────────────────────────────
  const loadItems = useCallback(async (isRefresh = false) => {
    if (!profile?.house_id) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data, error } = await supabaseAdmin
        .from('grocery_items')
        .select('*, profiles!added_by(username)')
        .eq('house_id', profile.house_id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const mapped: GroceryItem[] = data.map((row: any) => ({
          ...row,
          adder_username: row.profiles?.username ?? 'Roommate',
        }));
        setItems(mapped);
      }
    } catch (e) {
      console.warn('Failed to load grocery items:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.house_id, setItems]);

  // ─── Realtime subscription ────────────────────────────────────
  useEffect(() => {
    if (!visible || !profile?.house_id) return;

    loadItems();

    channelRef.current = supabase
      .channel('grocery-' + profile.house_id)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'grocery_items',
          filter: `house_id=eq.${profile.house_id}`,
        },
        async (payload) => {
          // Fetch with username join
          const { data } = await supabaseAdmin
            .from('grocery_items')
            .select('*, profiles!added_by(username)')
            .eq('id', payload.new.id)
            .single();
          if (data) {
            addItem({ ...data, adder_username: (data as any).profiles?.username ?? 'Roommate' });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'grocery_items',
          filter: `house_id=eq.${profile.house_id}`,
        },
        (payload) => {
          updateItem(payload.new.id, payload.new as Partial<GroceryItem>);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'grocery_items',
          filter: `house_id=eq.${profile.house_id}`,
        },
        (payload) => {
          removeItem(payload.old.id);
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [visible, profile?.house_id]);

  // ─── Add item ─────────────────────────────────────────────────
  const handleAdd = async () => {
    const name = itemName.trim();
    if (!name || !profile?.id || !profile?.house_id) return;

    setAdding(true);
    Keyboard.dismiss();

    try {
      const { data, error } = await supabaseAdmin
        .from('grocery_items')
        .insert({
          house_id: profile.house_id,
          added_by: profile.id,
          name,
          emoji: selectedEmoji,
          quantity: itemQty.trim() || null,
          is_checked: false,
        })
        .select('*, profiles!added_by(username)')
        .single();

      if (error) throw new Error(error.message);

      // Optimistic — realtime will also fire but Zustand deduplicates by id on update
      if (data) {
        addItem({ ...data, adder_username: (data as any).profiles?.username ?? profile.username });
      }

      setItemName('');
      setItemQty('');
      setSelectedEmoji('🛒');
    } catch (e: any) {
      const msg = e?.message || 'Failed to add item';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Error', msg);
    } finally {
      setAdding(false);
    }
  };

  // ─── Toggle check ─────────────────────────────────────────────
  const handleToggle = async (item: GroceryItem) => {
    const newChecked = !item.is_checked;
    // Optimistic update
    updateItem(item.id, {
      is_checked: newChecked,
      checked_by: newChecked ? profile?.id ?? null : null,
      checked_at: newChecked ? new Date().toISOString() : null,
    });

    await supabaseAdmin
      .from('grocery_items')
      .update({
        is_checked: newChecked,
        checked_by: newChecked ? profile?.id : null,
        checked_at: newChecked ? new Date().toISOString() : null,
      })
      .eq('id', item.id);
  };

  // ─── Delete item ──────────────────────────────────────────────
  const handleDelete = (item: GroceryItem) => {
    const doDelete = async () => {
      removeItem(item.id); // optimistic
      await supabaseAdmin.from('grocery_items').delete().eq('id', item.id);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Remove "${item.name}" from the list?`)) doDelete();
    } else {
      Alert.alert('Remove Item', `Remove "${item.name}" from the list?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  // ─── Clear all checked ────────────────────────────────────────
  const handleClearChecked = () => {
    const checkedItems = items.filter((i) => i.is_checked);
    if (!checkedItems.length) return;

    const doDelete = async () => {
      const ids = checkedItems.map((i) => i.id);
      ids.forEach((id) => removeItem(id)); // optimistic
      await supabaseAdmin.from('grocery_items').delete().in('id', ids);
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Clear all checked items?')) doDelete();
    } else {
      Alert.alert('Clear Checked', `Remove ${checkedItems.length} checked item(s)?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  // ─── Derived lists ────────────────────────────────────────────
  const uncheckedItems = items.filter((i) => !i.is_checked);
  const checkedItems = items.filter((i) => i.is_checked);

  // ─── Render item ──────────────────────────────────────────────
  const renderItem = ({ item }: { item: GroceryItem }) => (
    <View style={[styles.itemRow, item.is_checked && styles.itemRowChecked]}>
      <TouchableOpacity onPress={() => handleToggle(item)} style={styles.checkBtn} activeOpacity={0.7}>
        <Ionicons
          name={item.is_checked ? 'checkbox' : 'square-outline'}
          size={22}
          color={item.is_checked ? COLORS.primary : '#CBD5E1'}
        />
      </TouchableOpacity>
      <Text style={styles.itemEmoji}>{item.emoji}</Text>
      <View style={styles.itemInfo}>
        <Text style={[styles.itemName, item.is_checked && styles.itemNameChecked]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.itemMeta}>
          {item.quantity ? `${item.quantity} · ` : ''}Added by {item.adder_username}
        </Text>
      </View>
      {(item.added_by === profile?.id || profile?.is_admin) && (
        <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={16} color="#94A3B8" />
        </TouchableOpacity>
      )}
    </View>
  );

  // ─── Empty state ──────────────────────────────────────────────
  const EmptyState = () => (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyEmoji}>🛒</Text>
      <Text style={styles.emptyTitle}>List is empty</Text>
      <Text style={styles.emptyText}>Add the first item above and your roommates will see it instantly!</Text>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* ── Header ── */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconBox}>
                <Ionicons name="cart" size={18} color="#D97706" />
              </View>
              <View>
                <Text style={styles.headerTitle}>Shared Grocery List</Text>
                <Text style={styles.headerSub}>
                  {items.length === 0 ? 'No items yet' : `${uncheckedItems.length} pending · ${checkedItems.length} done`}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* ── Add Item Row ── */}
          <View style={styles.addRow}>
            <TouchableOpacity
              style={styles.emojiBtn}
              onPress={() => setShowEmojiPicker((v) => !v)}
              activeOpacity={0.7}
            >
              <Text style={styles.emojiBtnText}>{selectedEmoji}</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.nameInput}
              placeholder="Add an item..."
              placeholderTextColor="#94A3B8"
              value={itemName}
              onChangeText={setItemName}
              returnKeyType="done"
              onSubmitEditing={handleAdd}
              maxLength={60}
            />
            <TextInput
              style={styles.qtyInput}
              placeholder="Qty"
              placeholderTextColor="#94A3B8"
              value={itemQty}
              onChangeText={setItemQty}
              maxLength={12}
            />
            <TouchableOpacity
              style={[styles.addBtn, (!itemName.trim() || adding) && styles.addBtnDisabled]}
              onPress={handleAdd}
              disabled={!itemName.trim() || adding}
              activeOpacity={0.8}
            >
              {adding ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="add" size={20} color="#FFF" />
              )}
            </TouchableOpacity>
          </View>

          {/* ── Emoji Picker ── */}
          {showEmojiPicker && (
            <View style={styles.emojiPicker}>
              {EMOJI_OPTIONS.map((e) => (
                <TouchableOpacity
                  key={e}
                  style={[styles.emojiOption, selectedEmoji === e && styles.emojiOptionSelected]}
                  onPress={() => { setSelectedEmoji(e); setShowEmojiPicker(false); }}
                >
                  <Text style={styles.emojiOptionText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ── List ── */}
          {loading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
          ) : items.length === 0 ? (
            <EmptyState />
          ) : (
            <FlatList
              data={uncheckedItems}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              style={styles.list}
              contentContainerStyle={{ paddingBottom: 8 }}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => loadItems(true)}
                  colors={[COLORS.primary]}
                  tintColor={COLORS.primary}
                />
              }
              ListFooterComponent={
                checkedItems.length > 0 ? (
                  <View>
                    {/* Checked section toggle */}
                    <TouchableOpacity
                      style={styles.checkedHeader}
                      onPress={() => setShowChecked((v) => !v)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={showChecked ? 'chevron-down' : 'chevron-forward'}
                        size={14}
                        color="#94A3B8"
                      />
                      <Text style={styles.checkedHeaderText}>
                        Got it ✓ ({checkedItems.length})
                      </Text>
                      <TouchableOpacity onPress={handleClearChecked} style={styles.clearBtn}>
                        <Text style={styles.clearBtnText}>Clear all</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                    {showChecked && checkedItems.map((item) => (
                      <View key={item.id}>{renderItem({ item })}</View>
                    ))}
                  </View>
                ) : undefined
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 14,
    paddingBottom: 32,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 15, fontWeight: '800', color: '#1A1A24' },
  headerSub: { fontSize: 10, color: '#7E7E8F', marginTop: 1 },

  // Add row
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 6,
  },
  emojiBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emojiBtnText: { fontSize: 18 },
  nameInput: {
    flex: 1,
    fontSize: 13,
    color: '#1A1A24',
    paddingVertical: 6,
  },
  qtyInput: {
    width: 48,
    fontSize: 11,
    color: '#1A1A24',
    paddingVertical: 6,
    textAlign: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#E2E8F0',
    paddingLeft: 6,
  },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: { backgroundColor: '#A7C4B0' },

  // Emoji picker
  emojiPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emojiOption: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
  },
  emojiOptionSelected: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  emojiOptionText: { fontSize: 18 },

  // List
  list: { flex: 1 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  itemRowChecked: { opacity: 0.6 },
  checkBtn: { padding: 2 },
  itemEmoji: { fontSize: 20 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 13, fontWeight: '600', color: '#1E293B' },
  itemNameChecked: { textDecorationLine: 'line-through', color: '#94A3B8' },
  itemMeta: { fontSize: 10, color: '#94A3B8', marginTop: 1 },
  deleteBtn: { padding: 6 },

  // Checked section
  checkedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 4,
  },
  checkedHeaderText: { fontSize: 11, color: '#94A3B8', fontWeight: '600', flex: 1 },
  clearBtn: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  clearBtnText: { fontSize: 10, color: '#EF4444', fontWeight: '700' },

  // Empty state
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A24' },
  emptyText: { fontSize: 11, color: '#94A3B8', textAlign: 'center', lineHeight: 16, maxWidth: 240 },
});
