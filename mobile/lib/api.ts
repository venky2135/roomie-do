import axios from 'axios';
import { supabase } from './supabase';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL!;

const api = axios.create({ baseURL: BASE_URL });

// Attach Supabase JWT to every request
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Auth ────────────────────────────────────────────────
export const registerUser = (payload: {
  username: string;
  password: string;
  phone?: string;
  avatarUrl?: string;
}) => api.post('/api/auth/register', payload);

export const loginUser = (payload: {
  identifier: string;
  password: string;
}) => api.post('/api/auth/login', payload);

// ─── House ───────────────────────────────────────────────
export const createHouse = (houseName: string) =>
  api.post('/api/house/create', { houseName });

export const joinHouse = (inviteCode: string) =>
  api.post('/api/house/join', { inviteCode });

export const regenerateCode = () =>
  api.post('/api/house/regenerate-code');

export const removeMember = (memberId: string) =>
  api.delete(`/api/house/member/${memberId}`);

// ─── Tasks ───────────────────────────────────────────────
export const fetchTasks = (houseId: string) =>
  api.get(`/api/tasks/${houseId}`);

export const logTask = (payload: {
  taskId: string;
  notes?: string;
  photoUrl?: string;
  isHighPriority?: boolean;
}) => api.post('/api/tasks/log', payload);

export const upsertTask = (payload: {
  id?: string;
  houseId: string;
  name: string;
  icon: string;
  category: string;
  baseCredits: number;
  photoRequired: boolean;
}) => api.post('/api/tasks/admin/upsert', payload);

export const toggleTask = (taskId: string) =>
  api.patch(`/api/tasks/admin/toggle/${taskId}`);

// ─── Leaderboard ─────────────────────────────────────────
export const fetchLeaderboard = (houseId: string, period: 'week' | 'month' | 'all' = 'week') =>
  api.get(`/api/leaderboard/${houseId}`, { params: { period } });

// ─── Analytics ───────────────────────────────────────────
export const fetchAnalytics = (houseId: string) =>
  api.get(`/api/analytics/${houseId}`);

// ─── Nudge ───────────────────────────────────────────────
export const sendNudge = (toUserId: string) =>
  api.post('/api/nudge', { toUserId });

// ─── Notifications ───────────────────────────────────────
export const registerDeviceToken = (token: string, deviceType: string = 'android') =>
  api.post('/api/notifications/register-token', { token, deviceType });

export const unregisterDeviceToken = (token: string) =>
  api.delete('/api/notifications/unregister-token', { data: { token } });

export const sendTestNotification = (title?: string, body?: string) =>
  api.post('/api/notifications/test', { title, body });

export const notifyChoreLogged = (payload: { taskId: string; logId: string; taskName: string }) =>
  api.post('/api/notifications/notify-chore-logged', payload);

export const notifyChoreApproved = (payload: {
  logId: string;
  workerUserId: string;
  taskName: string;
  award?: number;
}) => api.post('/api/notifications/notify-chore-approved', payload);

export const notifyLeaveRequested = (payload: {
  logId: string;
  duration?: string;
  reason?: string;
}) => api.post('/api/notifications/notify-leave-requested', payload);

export const notifyLeaveApproved = (payload: {
  logId: string;
  workerUserId: string;
  isFullyApproved?: boolean;
  duration?: string;
}) => api.post('/api/notifications/notify-leave-approved', payload);

export const notifyComplaintRaised = (payload: {
  logId: string;
  accusedUsername: string;
  category: string;
  title: string;
}) => api.post('/api/notifications/notify-complaint-raised', payload);

export const notifyComplaintUpheld = (payload: {
  logId: string;
  accusedUserId: string;
  accusedUsername: string;
  title: string;
  streakPenalty?: number;
}) => api.post('/api/notifications/notify-complaint-upheld', payload);

export const notifyMarketplaceCreated = (payload: {
  taskId: string;
  title: string;
  bountyXp?: number;
}) => api.post('/api/notifications/notify-marketplace-created', payload);

export const notifyMarketplaceClaimed = (payload: {
  taskId: string;
  title: string;
  creatorId?: string;
  bountyXp?: number;
}) => api.post('/api/notifications/notify-marketplace-claimed', payload);

export const triggerZomatoNudge = (houseOnly = true) =>
  api.post('/api/notifications/zomato-nudge', { houseOnly });

export const triggerCatchup = () =>
  api.get('/api/notifications/catchup');

export const triggerSundayReset = (houseId?: string, force = true) =>
  api.post('/api/notifications/sunday-reset', { houseId, force });

export default api;

