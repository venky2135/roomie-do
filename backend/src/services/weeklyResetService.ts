import { supabase } from '../supabaseClient';
import { NotificationQueueService } from './notificationQueueService';

export interface WeeklyScoreMember {
  id: string;
  username: string;
  avatar_url: string | null;
  credits: number;
  choresCount: number;
}

export interface HouseWeeklyStakes {
  bounty: string;
  penalty: string;
}

const DEFAULT_STAKES: HouseWeeklyStakes = {
  bounty: 'Winner gets treated to weekend takeout dinner by housemates 🍕',
  penalty: 'Loser does the weekend kitchen deep clean & takes out the trash 🧹',
};

export class WeeklyResetService {
  /**
   * Generates a week key for a given date, e.g., '2026-W45'.
   */
  static getWeekKey(d: Date = new Date()): string {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNr = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - dayNr + 3);
    const firstThursday = date.getTime();
    date.setUTCMonth(0, 1);
    if (date.getUTCDay() !== 4) {
      date.setUTCMonth(0, 1 + ((4 - date.getUTCDay() + 7) % 7));
    }
    const weekNumber = 1 + Math.ceil((firstThursday - date.getTime()) / 604800000);
    return `${date.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
  }

  /**
   * Fetch the house's current weekly bounty & penalty set on the homescreen.
   */
  static async fetchHouseWeeklyStakes(houseId: string): Promise<HouseWeeklyStakes> {
    try {
      const { data, error } = await supabase
        .from('task_templates')
        .select('name')
        .eq('house_id', houseId)
        .eq('category', 'WeeklyStakes')
        .maybeSingle();

      if (error || !data) {
        return DEFAULT_STAKES;
      }

      const parsed = JSON.parse(data.name);
      return {
        bounty: parsed.bounty?.trim() || DEFAULT_STAKES.bounty,
        penalty: parsed.penalty?.trim() || DEFAULT_STAKES.penalty,
      };
    } catch {
      return DEFAULT_STAKES;
    }
  }

  /**
   * Find or create the dedicated Weekly Awards task template for the house.
   */
  static async getOrCreateWeeklyTemplate(houseId: string): Promise<string | null> {
    const { data: existing } = await supabase
      .from('task_templates')
      .select('id')
      .eq('house_id', houseId)
      .eq('category', 'WeeklyAwards')
      .limit(1)
      .maybeSingle();

    if (existing?.id) return existing.id;

    const { data: created, error } = await supabase
      .from('task_templates')
      .insert({
        house_id: houseId,
        name: 'Sunday Awards Ceremony',
        icon: 'trophy',
        category: 'WeeklyAwards',
        base_credits: 0,
        photo_required: false,
        is_active: false,
      })
      .select('id')
      .single();

    if (error || !created) {
      console.warn('[WeeklyReset] Failed to create weekly awards template:', error);
      const { data: anyTemplate } = await supabase
        .from('task_templates')
        .select('id')
        .eq('house_id', houseId)
        .limit(1)
        .maybeSingle();
      return anyTemplate?.id || null;
    }

    return created.id;
  }

  /**
   * Executes the Sunday calculation for a single house:
   * 1. Calculates winner and loser using the last 7 days of chores.
   * 2. Pulls real-life stakes (bounty & penalty) from the homescreen settings.
   * 3. No bonus XP for the winner (purely bragging rights + bounty).
   * 4. Clears previous live feed logs so database stays lightweight & loading is fast.
   * 5. Inserts the new Sunday Awards ceremony card and queues push notification.
   */
  static async runWeeklyResetForHouse(
    houseId: string,
    force = false
  ): Promise<{ success: boolean; alreadyRan?: boolean; winner?: string; loser?: string; bounty?: string; penalty?: string }> {
    const weekKey = this.getWeekKey();

    // 1. Check if already calculated for this house and week
    const { data: existingReset } = await supabase
      .from('weekly_resets')
      .select('id')
      .eq('house_id', houseId)
      .eq('week_key', weekKey)
      .maybeSingle();

    if (existingReset && !force) {
      return { success: true, alreadyRan: true };
    }

    // 2. Fetch all members in the house
    const { data: members, error: memErr } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, total_credits, xp, weekly_xp')
      .eq('house_id', houseId);

    if (memErr || !members || members.length === 0) {
      return { success: false };
    }

    const memberIds = members.map((m) => m.id);

    // 3. Query approved task logs for the last 7 days
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { data: logs } = await supabase
      .from('task_logs')
      .select('user_id, credits_awarded, notes')
      .in('user_id', memberIds)
      .gte('completed_at', weekAgo.toISOString());

    // Filter only completed chores
    const isApprovedLog = (notes: string | null | undefined): boolean => {
      if (!notes) return true;
      try {
        const parsed = JSON.parse(notes);
        if (typeof parsed === 'object' && parsed !== null) {
          if (parsed.type === 'leave_request') return parsed.status === 'approved';
          if (parsed.type === 'weekly_announcement') return false;
          if (parsed.status === 'pending_verification') return false;
          if (parsed.status === 'completed') return true;
        }
      } catch {}
      return true;
    };

    const validLogs = (logs || []).filter((l) => isApprovedLog(l.notes));

    // 4. Calculate scores per member
    const scores: Record<string, WeeklyScoreMember> = {};
    members.forEach((m: any) => {
      scores[m.id] = {
        id: m.id,
        username: m.username,
        avatar_url: m.avatar_url,
        credits: m.weekly_xp || 0,
        choresCount: 0,
      };
    });

    let totalHouseCredits = 0;
    validLogs.forEach((l) => {
      if (scores[l.user_id]) {
        scores[l.user_id].choresCount += 1;
        // Fallback: if weekly_xp was not populated, add from task_logs
        if (scores[l.user_id].credits === 0) {
          scores[l.user_id].credits += l.credits_awarded || 0;
        }
        totalHouseCredits += l.credits_awarded || 0;
      }
    });

    const sortedMembers = Object.values(scores).sort((a, b) => b.credits - a.credits);
    const winner = sortedMembers[0];
    const loser = sortedMembers.length > 1 ? sortedMembers[sortedMembers.length - 1] : sortedMembers[0];

    // 5. Fetch actual weekly stakes from homescreen
    const stakes = await this.fetchHouseWeeklyStakes(houseId);

    // NOTE: Per requirement, NO bonus XP is awarded to the winner.

    // 6. CLEAR LIVE FEED DATA:
    // Delete older task logs for all house members so the database stays fast & loading is instant!
    console.log(`[WeeklyReset] Clearing previous week live feed logs for house ${houseId}...`);
    const { error: deleteErr } = await supabase
      .from('task_logs')
      .delete()
      .in('user_id', memberIds);

    if (deleteErr) {
      console.warn('[WeeklyReset] Warning while purging previous task logs:', deleteErr.message);
    } else {
      console.log(`[WeeklyReset] Live feed successfully reset and cleared for new week.`);
    }

    // 7. Post Sunday Awards Ceremony Card as the fresh new post in Live Feed
    const templateId = await this.getOrCreateWeeklyTemplate(houseId);
    if (templateId && winner) {
      const announcementMetadata = {
        type: 'weekly_announcement',
        weekKey,
        winner: {
          id: winner.id,
          username: winner.username,
          avatarUrl: winner.avatar_url || '👑',
          credits: winner.credits,
          choresCount: winner.choresCount,
          prize: stakes.bounty,
        },
        loser: {
          id: loser.id,
          username: loser.username,
          avatarUrl: loser.avatar_url || '🧽',
          credits: loser.credits,
          choresCount: loser.choresCount,
          penalty: stakes.penalty,
        },
        houseStats: {
          totalChores: validLogs.length,
          totalCredits: totalHouseCredits,
          membersCount: members.length,
        },
        announcedAt: new Date().toISOString(),
      };

      await supabase.from('task_logs').insert({
        user_id: winner.id,
        task_id: templateId,
        credits_awarded: 0, // No bonus credits
        notes: JSON.stringify(announcementMetadata),
        completed_at: new Date().toISOString(),
      });
    }

    // 8. Reset weekly_xp to 0 on profiles for the fresh new week!
    await supabase
      .from('profiles')
      .update({ weekly_xp: 0 })
      .in('id', memberIds);

    // 9. Record in weekly_resets (prevents duplicate runs)
    await supabase.from('weekly_resets').upsert(
      {
        house_id: houseId,
        week_key: weekKey,
        winner_id: winner.id,
        loser_id: loser.id,
        winner_credits: winner.credits,
        loser_credits: loser.credits,
        details: {
          winnerName: winner.username,
          loserName: loser.username,
          bounty: stakes.bounty,
          penalty: stakes.penalty,
          totalChores: validLogs.length,
        },
        announced_at: new Date().toISOString(),
      },
      { onConflict: 'house_id, week_key' }
    );

    // 9. Queue and send push notification to all housemates
    const notifTitle = '🏆 Sunday Awards Ceremony is Live!';
    const notifBody = `👑 Winner: @${winner.username} (${stakes.bounty}) | 🧽 Loser: @${loser.username} (${stakes.penalty})`;

    await NotificationQueueService.enqueue({
      houseId,
      title: notifTitle,
      body: notifBody,
      data: {
        type: 'weekly_announcement',
        weekKey,
      },
    });

    console.log(
      `[WeeklyReset] Announced Sunday awards for house ${houseId} | Winner: @${winner.username} | Loser: @${loser.username}`
    );

    return {
      success: true,
      winner: winner.username,
      loser: loser.username,
      bounty: stakes.bounty,
      penalty: stakes.penalty,
    };
  }

  /**
   * Check and run pending Sunday resets across all houses.
   */
  static async checkAndRunAllPendingWeeklyResets(): Promise<void> {
    const { data: houses } = await supabase.from('houses').select('id, name');
    if (!houses || houses.length === 0) return;

    for (const house of houses) {
      try {
        await this.runWeeklyResetForHouse(house.id);
      } catch (err) {
        console.error(`[WeeklyReset] Failed for house ${house.name} (${house.id}):`, err);
      }
    }
  }
}
