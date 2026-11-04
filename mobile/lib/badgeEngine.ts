import { Profile } from '../store/useAuthStore';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BadgeStats {
  /** Total approved chores (all categories) */
  approvedCount: number;
  /** Approved chores in the Cleaning category */
  cleaningCount: number;
  /** Approved chores completed on a weekend */
  weekendCount: number;
  /** Approved chores submitted with a photo */
  photoProofCount: number;
  /** Marketplace tasks completed */
  marketplaceCount: number;
  /** Approved leave requests */
  leaveApprovedCount: number;
  /** Total emoji reactions left on the feed (task log reactions given) */
  reactionsGiven: number;
}

export interface Badge {
  id: string;
  name: string;
  /** Ionicons icon name */
  icon: string;
  /** Brand colour when earned */
  color: string;
  /** Short description shown in the detail sheet */
  description: string;
  /** Human-readable unlock condition */
  condition: string;
  /** Progress value (0–1) toward unlock — 1 when earned */
  progress: number;
  /** Numeric progress toward the goal (e.g. 12) */
  current: number;
  /** Goal number (e.g. 20) — 0 means binary (earned/not) */
  goal: number;
  earned: boolean;
  /** XP shown as reward flavour text in the sheet */
  xpReward: number;
}

export const DEFAULT_STATS: BadgeStats = {
  approvedCount: 0,
  cleaningCount: 0,
  weekendCount: 0,
  photoProofCount: 0,
  marketplaceCount: 0,
  leaveApprovedCount: 0,
  reactionsGiven: 0,
};

// ─── Badge Definitions ───────────────────────────────────────────────────────

type BadgeDef = Omit<Badge, 'earned' | 'progress' | 'current'> & {
  /** Returns [current, goal]; earned = current >= goal (goal=0 means always) */
  evaluate: (profile: Profile, stats: BadgeStats) => [number, number];
};

const BADGE_DEFS: BadgeDef[] = [
  {
    id: 'moved_in',
    name: 'Moved In',
    icon: 'home',
    color: '#4CAF82',
    description: 'Welcome home! You joined the house and started your roommate journey.',
    condition: 'Join the house',
    goal: 0,
    xpReward: 0,
    evaluate: () => [1, 0],
  },
  {
    id: 'first_cook',
    name: 'First Cook',
    icon: 'restaurant',
    color: '#FF7043',
    description: 'You logged your very first chore — the journey begins!',
    condition: 'Log your first chore',
    goal: 1,
    xpReward: 10,
    evaluate: (_p, s) => [Math.min(s.approvedCount, 1), 1],
  },
  {
    id: 'flame_keeper',
    name: 'Flame Keeper',
    icon: 'flame',
    color: '#FF5722',
    description: 'Three days in a row? You\'re on fire! 🔥',
    condition: 'Maintain a 3-day streak',
    goal: 3,
    xpReward: 25,
    evaluate: (p) => [Math.min(p.streak_days, 3), 3],
  },
  {
    id: 'week_warrior',
    name: 'Week Warrior',
    icon: 'calendar',
    color: '#5C6BC0',
    description: 'Seven consecutive days of chores — you\'re a true warrior!',
    condition: 'Maintain a 7-day streak',
    goal: 7,
    xpReward: 50,
    evaluate: (p) => [Math.min(p.streak_days, 7), 7],
  },
  {
    id: 'chore_starter',
    name: 'Chore Starter',
    icon: 'checkmark-circle',
    color: '#4CAF82',
    description: 'Five approved chores under your belt. You\'re getting the hang of it!',
    condition: 'Get 5 chores approved',
    goal: 5,
    xpReward: 30,
    evaluate: (_p, s) => [Math.min(s.approvedCount, 5), 5],
  },
  {
    id: 'chore_master',
    name: 'Chore Master',
    icon: 'medal',
    color: '#FFD700',
    description: 'Twenty approved chores! You\'re the backbone of this household.',
    condition: 'Get 20 chores approved',
    goal: 20,
    xpReward: 100,
    evaluate: (_p, s) => [Math.min(s.approvedCount, 20), 20],
  },
  {
    id: 'super_cleaner',
    name: 'Super Cleaner',
    icon: 'sparkles',
    color: '#00BCD4',
    description: 'Ten cleaning chores done — this place has never looked better!',
    condition: 'Complete 10 Cleaning chores',
    goal: 10,
    xpReward: 60,
    evaluate: (_p, s) => [Math.min(s.cleaningCount, 10), 10],
  },
  {
    id: 'market_hero',
    name: 'Market Hero',
    icon: 'cart',
    color: '#FFA726',
    description: 'Five marketplace tasks complete — you\'re the house errand champion!',
    condition: 'Complete 5 Marketplace tasks',
    goal: 5,
    xpReward: 50,
    evaluate: (_p, s) => [Math.min(s.marketplaceCount, 5), 5],
  },
  {
    id: 'weekend_champ',
    name: 'Weekend Champ',
    icon: 'trophy',
    color: '#E91E63',
    description: 'While others rest on weekends, you keep the house running. Legend.',
    condition: 'Complete 3 chores on weekends',
    goal: 3,
    xpReward: 40,
    evaluate: (_p, s) => [Math.min(s.weekendCount, 3), 3],
  },
  {
    id: 'leave_planner',
    name: 'Leave Planner',
    icon: 'airplane',
    color: '#0284C7',
    description: 'You planned ahead and submitted a leave request. Responsible roommate!',
    condition: 'Get 1 leave request approved',
    goal: 1,
    xpReward: 20,
    evaluate: (_p, s) => [Math.min(s.leaveApprovedCount, 1), 1],
  },
  {
    id: 'xp_climber',
    name: 'XP Climber',
    icon: 'flash',
    color: '#FF9800',
    description: 'You\'ve earned 100 XP — the grind is paying off!',
    condition: 'Earn 100 XP total',
    goal: 100,
    xpReward: 0,
    evaluate: (p) => [Math.min(p.xp, 100), 100],
  },
  {
    id: 'xp_legend',
    name: 'XP Legend',
    icon: 'star',
    color: '#9C27B0',
    description: '500 XP! You\'ve ascended beyond ordinary roommate status.',
    condition: 'Earn 500 XP total',
    goal: 500,
    xpReward: 0,
    evaluate: (p) => [Math.min(p.xp, 500), 500],
  },
  {
    id: 'photo_pro',
    name: 'Photo Pro',
    icon: 'camera',
    color: '#607D8B',
    description: 'Five tasks documented with photos — the proof is in the picture!',
    condition: 'Submit 5 chores with photo proof',
    goal: 5,
    xpReward: 30,
    evaluate: (_p, s) => [Math.min(s.photoProofCount, 5), 5],
  },
  {
    id: 'social_butterfly',
    name: 'Social Butterfly',
    icon: 'chatbubbles',
    color: '#EC407A',
    description: 'You react and engage with housemates\' chores. Community spirit!',
    condition: 'React to 10 chores in the feed',
    goal: 10,
    xpReward: 20,
    evaluate: (_p, s) => [Math.min(s.reactionsGiven, 10), 10],
  },
  {
    id: 'house_god',
    name: 'House God',
    icon: 'ribbon',
    color: '#FFD700',
    description: 'Level 10 achieved. You are the ultimate household legend. 👑',
    condition: 'Reach Level 10',
    goal: 10,
    xpReward: 0,
    evaluate: (p) => [Math.min(p.level ?? 1, 10), 10],
  },
];

// ─── Engine ──────────────────────────────────────────────────────────────────

/**
 * Compute the full badge list with earned/progress state for a user.
 * Pass the profile from useAuthStore and supplemental stats from Supabase.
 */
export function computeBadges(profile: Profile, stats: BadgeStats): Badge[] {
  return BADGE_DEFS.map((def) => {
    const [current, goal] = def.evaluate(profile, stats);
    const earned = goal === 0 ? true : current >= goal;
    const progress = goal === 0 ? 1 : Math.min(current / goal, 1);

    return {
      id: def.id,
      name: def.name,
      icon: def.icon,
      color: def.color,
      description: def.description,
      condition: def.condition,
      goal: def.goal,
      xpReward: def.xpReward,
      current,
      progress,
      earned,
    };
  });
}

/** Returns count of earned badges. */
export function countEarned(badges: Badge[]): number {
  return badges.filter((b) => b.earned).length;
}

