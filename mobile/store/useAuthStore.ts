import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { unregisterPushNotificationsAsync } from '../lib/notifications';

export interface Profile {
  id: string;
  house_id: string | null;
  username: string;
  phone: string;
  avatar_url: string | null;
  total_credits: number;
  level: number;
  xp: number;
  streak_days: number;
  is_admin: boolean;
  last_active_at: string | null;
}

interface AuthState {
  session: any | null;
  profile: Profile | null;
  loading: boolean;
  initialized: boolean;
  setSession: (session: any) => void;
  setProfile: (profile: Profile | null) => void;
  setInitialized: (initialized: boolean) => void;
  fetchProfile: (userId: string) => Promise<Profile | null>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  loading: true,
  initialized: false,

  setSession: (session) => set({ session }),

  setProfile: (profile) => set({ profile }),

  setInitialized: (initialized) => set({ initialized, loading: false }),

  fetchProfile: async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!error && data) {
        set({ profile: data as Profile, initialized: true, loading: false });
        return data as Profile;
      }
    } catch (e) {
      console.warn('Failed to fetch profile', e);
    }
    set({ initialized: true, loading: false });
    return null;
  },

  refreshProfile: async () => {
    const { session } = get();
    if (session?.user?.id) {
      await get().fetchProfile(session.user.id);
    }
  },

  signOut: async () => {
    try {
      await unregisterPushNotificationsAsync();
    } catch (e) {
      console.warn('Failed to unregister push notifications during signOut:', e);
    }
    await supabase.auth.signOut();
    set({ session: null, profile: null, initialized: true, loading: false });
  },
}));
