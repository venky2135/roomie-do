import { create } from 'zustand';
import { StorageAdapter } from '../lib/supabase';
import { fetchMarketplaceTasks, MarketplaceTask } from '../lib/taskWorkflow';

interface MarketplaceStoreState {
  unreadCount: number;
  seenIds: string[];
  lastSeenAt: number;
  loadSeenState: (userId: string) => Promise<void>;
  fetchAndComputeUnread: (houseId: string, userId: string) => Promise<void>;
  markAllSeen: (userId: string, taskIds: string[]) => Promise<void>;
}

const MAX_SEEN_IDS = 50;

const saveSeenData = async (userId: string, data: { lastSeenAt: number; seenIds: string[] }) => {
  try {
    const key = `marketplace_seen_v1_${userId}`;
    const payload = JSON.stringify({
      lastSeenAt: data.lastSeenAt,
      seenIds: data.seenIds.slice(-MAX_SEEN_IDS),
    });
    await StorageAdapter.setItem(key, payload);
  } catch (e) {
    console.warn('[useMarketplaceStore] Error saving seen data:', e);
  }
};

export const useMarketplaceStore = create<MarketplaceStoreState>((set, get) => ({
  unreadCount: 0,
  seenIds: [],
  lastSeenAt: 0,

  loadSeenState: async (userId: string) => {
    if (!userId) return;
    try {
      const key = `marketplace_seen_v1_${userId}`;
      const raw = await StorageAdapter.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        set({
          seenIds: Array.isArray(parsed.seenIds) ? parsed.seenIds : [],
          lastSeenAt: typeof parsed.lastSeenAt === 'number' ? parsed.lastSeenAt : 0,
        });
      } else {
        set({ seenIds: [], lastSeenAt: 0 });
      }
    } catch {
      set({ seenIds: [], lastSeenAt: 0 });
    }
  },

  fetchAndComputeUnread: async (houseId: string, userId: string) => {
    if (!houseId || !userId) return;
    await get().loadSeenState(userId);
    try {
      const tasks = await fetchMarketplaceTasks(houseId);
      const { seenIds, lastSeenAt } = get();

      // Open bounties posted by roommates that user hasn't seen
      const unreadTasks = tasks.filter((t) => {
        if (t.status !== 'open') return false;
        if (t.createdBy === userId) return false;
        if (seenIds.includes(t.id)) return false;
        if (lastSeenAt > 0 && t.createdAt) {
          const tTime = new Date(t.createdAt).getTime();
          if (!isNaN(tTime) && tTime <= lastSeenAt) return false;
        }
        return true;
      });

      set({ unreadCount: unreadTasks.length });
    } catch (e) {
      console.warn('[useMarketplaceStore] Error computing unread:', e);
    }
  },

  markAllSeen: async (userId: string, taskIds: string[]) => {
    if (!userId) return;
    const now = Date.now();
    const { seenIds } = get();
    const updatedIds = Array.from(new Set([...seenIds, ...taskIds])).slice(-MAX_SEEN_IDS);
    set({ lastSeenAt: now, seenIds: updatedIds, unreadCount: 0 });
    await saveSeenData(userId, { lastSeenAt: now, seenIds: updatedIds });
  },
}));
