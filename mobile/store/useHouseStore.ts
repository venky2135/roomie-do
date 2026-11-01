import { create } from 'zustand';

export interface TaskTemplate {
  id: string;
  house_id: string;
  name: string;
  icon: string;
  category: string;
  base_credits: number;
  photo_required: boolean;
  is_active: boolean;
}

export interface Member {
  id: string;
  username: string;
  avatar_url: string | null;
  total_credits: number;
  level: number;
  xp: number;
  streak_days: number;
  is_admin: boolean;
}

export interface House {
  id: string;
  name: string;
  invite_code: string;
  admin_id: string;
}

interface HouseState {
  house: House | null;
  members: Member[];
  tasks: TaskTemplate[];
  setHouse: (house: House | null) => void;
  setMembers: (members: Member[]) => void;
  setTasks: (tasks: TaskTemplate[]) => void;
  updateTask: (task: TaskTemplate) => void;
  removeTask: (taskId: string) => void;
}

export const useHouseStore = create<HouseState>((set) => ({
  house: null,
  members: [],
  tasks: [],

  setHouse: (house) => set({ house }),
  setMembers: (members) => set({ members }),
  setTasks: (tasks) => set({ tasks }),

  updateTask: (task) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === task.id ? task : t)),
    })),

  removeTask: (taskId) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
    })),
}));

