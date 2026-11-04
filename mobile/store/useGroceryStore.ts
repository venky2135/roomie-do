import { create } from 'zustand';

export interface GroceryItem {
  id: string;
  house_id: string;
  added_by: string;
  name: string;
  emoji: string;
  quantity: string | null;
  is_checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
  created_at: string;
  // joined field from profiles
  adder_username?: string;
}

interface GroceryState {
  items: GroceryItem[];
  setItems: (items: GroceryItem[]) => void;
  addItem: (item: GroceryItem) => void;
  updateItem: (id: string, updates: Partial<GroceryItem>) => void;
  removeItem: (id: string) => void;
  clearChecked: () => void;
}

export const useGroceryStore = create<GroceryState>((set) => ({
  items: [],

  setItems: (items) => set({ items }),

  addItem: (item) =>
    set((state) => {
      // Guard against double-add: optimistic insert + realtime INSERT event
      if (state.items.some((i) => i.id === item.id)) return state;
      return { items: [item, ...state.items] };
    }),

  updateItem: (id, updates) =>
    set((state) => ({
      items: state.items.map((i) => (i.id === id ? { ...i, ...updates } : i)),
    })),

  removeItem: (id) =>
    set((state) => ({ items: state.items.filter((i) => i.id !== id) })),

  clearChecked: () =>
    set((state) => ({ items: state.items.filter((i) => !i.is_checked) })),
}));

