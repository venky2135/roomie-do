import { supabaseAdmin } from './supabase';
import { parseLeaveMetadata } from './leaveWorkflow';

/**
 * Format a Date object into YYYY-MM-DD in local time.
 */
export function toLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Normalize any date string (e.g. "2026-11-5" or "2026-11-05" or ISO string)
 * into a standard YYYY-MM-DD format.
 */
export function normalizeDateString(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  const parts = trimmed.split(/[-/T ]/);
  if (parts.length >= 3) {
    const year = parts[0];
    const month = parts[1].padStart(2, '0');
    const day = parts[2].padStart(2, '0');
    if (year.length === 4) {
      return `${year}-${month}-${day}`;
    }
  }
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return toLocalDateString(parsed);
  }
  return null;
}

/**
 * Add days to a Date object.
 */
function addDays(date: Date, days: number): Date {
  const res = new Date(date);
  res.setDate(res.getDate() + days);
  return res;
}

/**
 * Calculate the streak of consecutive active days for a given user.
 * Active days include:
 * 1. Days with chore logs (completed or submitted).
 * 2. Days covered by approved leave requests (preserves the streak).
 *
 * If the user was active today, streak counts today + consecutive days back.
 * If the user was not active today yet, but active yesterday, streak counts yesterday + consecutive days back.
 * If the user missed both today and yesterday, streak is 0.
 */
export async function calculateUserStreak(userId: string): Promise<number> {
  try {
    if (!userId) return 0;

    // Fetch all logs of this user
    const { data: logs, error } = await supabaseAdmin
      .from('task_logs')
      .select('id, completed_at, notes')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false });

    if (error || !logs || logs.length === 0) {
      // Update profile with 0 streak if not already 0
      await supabaseAdmin
        .from('profiles')
        .update({ streak_days: 0 })
        .eq('id', userId);
      return 0;
    }

    const activeDates = new Set<string>();

    for (const log of logs) {
      const leaveMeta = parseLeaveMetadata(log.notes);
      if (leaveMeta) {
        // For leave requests: if approved, every day in the range counts as an active day
        if (leaveMeta.status === 'approved' && leaveMeta.startDate && leaveMeta.endDate) {
          const start = normalizeDateString(leaveMeta.startDate);
          const end = normalizeDateString(leaveMeta.endDate);
          if (start && end) {
            let curr = new Date(start + 'T00:00:00');
            const endD = new Date(end + 'T00:00:00');
            while (curr <= endD) {
              activeDates.add(toLocalDateString(curr));
              curr = addDays(curr, 1);
            }
          }
        }
      } else {
        // Regular chore log
        if (log.completed_at) {
          const logDate = new Date(log.completed_at);
          if (!isNaN(logDate.getTime())) {
            activeDates.add(toLocalDateString(logDate));
          }
        }
      }
    }

    if (activeDates.size === 0) {
      await supabaseAdmin
        .from('profiles')
        .update({ streak_days: 0 })
        .eq('id', userId);
      return 0;
    }

    const today = new Date();
    const todayStr = toLocalDateString(today);
    const yesterday = addDays(today, -1);
    const yesterdayStr = toLocalDateString(yesterday);

    let streak = 0;
    let checkDate: Date;

    if (activeDates.has(todayStr)) {
      // Active today: start counting from today backwards
      streak = 1;
      checkDate = yesterday;
      while (activeDates.has(toLocalDateString(checkDate))) {
        streak++;
        checkDate = addDays(checkDate, -1);
      }
    } else if (activeDates.has(yesterdayStr)) {
      // Not active today yet, but active yesterday: streak is still active
      streak = 1;
      checkDate = addDays(yesterday, -1);
      while (activeDates.has(toLocalDateString(checkDate))) {
        streak++;
        checkDate = addDays(checkDate, -1);
      }
    } else {
      // Missed both today and yesterday: streak broken
      streak = 0;
    }

    // Deduct penalties from upheld complaints against this user
    try {
      const { data: complaintLogs } = await supabaseAdmin
        .from('task_logs')
        .select('notes')
        .ilike('notes', '%"anonymous_complaint"%');

      if (complaintLogs) {
        for (const cl of complaintLogs) {
          try {
            const p = JSON.parse(cl.notes || '');
            if (p && p.type === 'anonymous_complaint' && p.status === 'upheld' && p.accusedId === userId) {
              const penalty = Number(p.streakPenalty) || 10;
              streak = Math.max(0, streak - penalty);
            }
          } catch {}
        }
      }
    } catch (_) {}

    // Persist streak to profiles table in Supabase
    await supabaseAdmin
      .from('profiles')
      .update({ streak_days: streak })
      .eq('id', userId);

    return streak;
  } catch (err) {
    console.warn('Error calculating user streak:', err);
    return 0;
  }
}

/**
 * Calculate and sync streak for all members of a house.
 */
export async function calculateAndSyncHouseStreaks(
  houseId: string
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  try {
    if (!houseId) return result;

    const { data: members } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('house_id', houseId);

    if (!members) return result;

    for (const member of members) {
      const s = await calculateUserStreak(member.id);
      result[member.id] = s;
    }
  } catch (err) {
    console.warn('Error calculating house streaks:', err);
  }
  return result;
}

