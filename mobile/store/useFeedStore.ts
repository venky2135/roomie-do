import { create } from 'zustand';
import { StorageAdapter, supabaseAdmin } from '../lib/supabase';
import {
  parseLogNotes,
  parseWeeklyAnnouncementMetadata,
} from '../lib/taskWorkflow';
import { parseLeaveMetadata } from '../lib/leaveWorkflow';
import { parseComplaintMetadata } from '../lib/complaintWorkflow';

export type FeedFilterType = 'all' | 'chores' | 'complaints' | 'leaves' | 'unapproved';

export interface FeedFilterItem {
  id: string;
  user_id: string;
  completed_at: string;
  notes: string | null;
}

export const isComplaintItem = (notes: string | null): boolean => {
  return parseComplaintMetadata(notes) !== null;
};

export const isLeaveItem = (notes: string | null): boolean => {
  return parseLeaveMetadata(notes) !== null;
};

export const isWeeklyItem = (notes: string | null): boolean => {
  return parseWeeklyAnnouncementMetadata(notes) !== null;
};

export const isChoreItem = (notes: string | null): boolean => {
  return !isComplaintItem(notes) && !isLeaveItem(notes) && !isWeeklyItem(notes);
};

export const isUnapprovedItem = (notes: string | null): boolean => {
  const comp = parseComplaintMetadata(notes);
  if (comp) {
    return comp.status === 'pending';
  }
  const leave = parseLeaveMetadata(notes);
  if (leave) {
    return leave.status !== 'approved';
  }
  if (isWeeklyItem(notes)) {
    return false;
  }
  const meta = parseLogNotes(notes);
  return meta.status === 'pending_verification';
};

interface FeedSeenData {
  lastSeenAt: number;
  seenIds: string[];
}

const MAX_SEEN_IDS = 50;

const saveSeenData = async (userId: string, data: FeedSeenData) => {
  try {
    const key = `feed_seen_v2_${userId}`;
    const payload = JSON.stringify({
      lastSeenAt: data.lastSeenAt,
      seenIds: data.seenIds.slice(-MAX_SEEN_IDS),
    });
    await StorageAdapter.setItem(key, payload);
  } catch (e) {
    console.warn('[useFeedStore] Error saving seen data:', e);
  }
};

interface FeedStoreState {
  activeFilter: FeedFilterType;
  seenIds: string[];
  lastSeenAt: number;
  unreadCounts: {
    all: number;
    chores: number;
    complaints: number;
    leaves: number;
    unapproved: number;
  };
  loadedForUserId: string | null;
  setActiveFilter: (filter: FeedFilterType) => void;
  loadSeenState: (userId: string) => Promise<void>;
  isItemSeen: (itemId: string, completedAt?: string) => boolean;
  computeUnreadCounts: (items: FeedFilterItem[]) => void;
  fetchAndComputeUnread: (houseId: string, userId: string) => Promise<void>;
  markItemsSeen: (userId: string, itemIds: string[], currentItems?: FeedFilterItem[]) => Promise<void>;
  markAllSeen: (userId: string, currentItems?: FeedFilterItem[]) => Promise<void>;
}

export const useFeedStore = create<FeedStoreState>((set, get) => ({
  activeFilter: 'chores',
  seenIds: [],
  lastSeenAt: 0,
  unreadCounts: {
    all: 0,
    chores: 0,
    complaints: 0,
    leaves: 0,
    unapproved: 0,
  },
  loadedForUserId: null,

  setActiveFilter: (filter: FeedFilterType) => set({ activeFilter: filter }),

  loadSeenState: async (userId: string) => {
    if (!userId) return;
    try {
      const key = `feed_seen_v2_${userId}`;
      const raw = await StorageAdapter.getItem(key);
      if (raw) {
        const parsed: FeedSeenData = JSON.parse(raw);
        set({
          seenIds: Array.isArray(parsed.seenIds) ? parsed.seenIds : [],
          lastSeenAt: typeof parsed.lastSeenAt === 'number' ? parsed.lastSeenAt : 0,
          loadedForUserId: userId,
        });
      } else {
        set({ seenIds: [], lastSeenAt: 0, loadedForUserId: userId });
      }
    } catch {
      set({ seenIds: [], lastSeenAt: 0, loadedForUserId: userId });
    }
  },

  isItemSeen: (itemId: string, completedAt?: string) => {
    const { seenIds, lastSeenAt } = get();
    if (seenIds.includes(itemId)) return true;
    if (lastSeenAt > 0 && completedAt) {
      const itemTime = new Date(completedAt).getTime();
      if (!isNaN(itemTime) && itemTime <= lastSeenAt) return true;
    }
    return false;
  },

  computeUnreadCounts: (items: FeedFilterItem[]) => {
    const { isItemSeen } = get();
    let all = 0;
    let chores = 0;
    let complaints = 0;
    let leaves = 0;
    let unapproved = 0;

    for (const item of items) {
      const seen = isItemSeen(item.id, item.completed_at);
      if (!seen) {
        all++;
        if (isChoreItem(item.notes)) chores++;
        if (isComplaintItem(item.notes)) complaints++;
        if (isLeaveItem(item.notes)) leaves++;
        if (isUnapprovedItem(item.notes)) unapproved++;
      }
    }

    set({
      unreadCounts: {
        all,
        chores,
        complaints,
        leaves,
        unapproved,
      },
    });
  },

  fetchAndComputeUnread: async (houseId: string, userId: string) => {
    if (!houseId || !userId) return;
    await get().loadSeenState(userId);
    try {
      const { data: memberProfiles } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('house_id', houseId);

      const memberIds = memberProfiles?.map((m) => m.id) ?? [];
      if (memberIds.length === 0) return;

      const { data } = await supabaseAdmin
        .from('task_logs')
        .select('id, user_id, completed_at, notes')
        .in('user_id', memberIds)
        .order('completed_at', { ascending: false })
        .limit(50);

      if (data) {
        get().computeUnreadCounts(data as FeedFilterItem[]);
      }
    } catch (e) {
      console.warn('[useFeedStore] Error fetching unread counts:', e);
    }
  },

  markItemsSeen: async (userId: string, itemIds: string[], currentItems?: FeedFilterItem[]) => {
    if (!userId || itemIds.length === 0) return;
    const { seenIds, lastSeenAt } = get();
    const updatedIds = Array.from(new Set([...seenIds, ...itemIds])).slice(-MAX_SEEN_IDS);
    set({ seenIds: updatedIds });
    await saveSeenData(userId, { lastSeenAt, seenIds: updatedIds });
    if (currentItems) {
      get().computeUnreadCounts(currentItems);
    }
  },

  markAllSeen: async (userId: string, currentItems?: FeedFilterItem[]) => {
    if (!userId) return;
    const now = Date.now();
    const allIds = currentItems ? currentItems.map((i) => i.id) : [];
    const updatedIds = allIds.slice(-MAX_SEEN_IDS);
    set({ lastSeenAt: now, seenIds: updatedIds });
    await saveSeenData(userId, { lastSeenAt: now, seenIds: updatedIds });
    if (currentItems) {
      get().computeUnreadCounts(currentItems);
    }
  },
}));
