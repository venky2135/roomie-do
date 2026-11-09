import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { supabase } from '../supabaseClient';

const router = Router();

// GET /api/leaderboard/:houseId
router.get('/:houseId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { houseId } = req.params;
  const rawPeriod = req.query.period;
  const period = Array.isArray(rawPeriod) ? rawPeriod[0] : (rawPeriod ?? 'week');

  let dateFilter: string | null = null;
  if (period === 'week') {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    dateFilter = weekAgo.toISOString();
  } else if (period === 'month') {
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    dateFilter = monthAgo.toISOString();
  }

  // Get members
  const { data: members } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, total_credits, xp, level, streak_days, weekly_xp, created_at')
    .eq('house_id', houseId);

  if (!members) {
    res.json({ leaderboard: [] });
    return;
  }

  if (period === 'week') {
    // Weekly: use dedicated weekly_xp column from profile
    const sorted = [...members]
      .sort((a: any, b: any) => (b.weekly_xp ?? 0) - (a.weekly_xp ?? 0))
      .map((m: any, i) => ({ ...m, rank: i + 1, periodCredits: m.weekly_xp ?? 0 }));
    res.json({ leaderboard: sorted });
    return;
  }

  if (period === 'all') {
    // All-time: use total_credits / xp from profile
    const sorted = [...members].sort((a, b) => (b.xp ?? b.total_credits ?? 0) - (a.xp ?? a.total_credits ?? 0));
    res.json({
      leaderboard: sorted.map((m, i) => ({ ...m, rank: i + 1, periodCredits: m.xp ?? m.total_credits ?? 0 })),
    });
    return;
  }

  const isApprovedLog = (notes: string | null | undefined): boolean => {
    if (!notes) return true; // legacy logs without metadata are treated as completed
    try {
      const parsed = JSON.parse(notes);
      if (typeof parsed === 'object' && parsed !== null) {
        if (parsed.type === 'leave_request') {
          return parsed.status === 'approved';
        }
        if (parsed.status === 'pending_verification') {
          return false;
        }
        if (parsed.status === 'completed') {
          return true;
        }
      }
    } catch {
      return true;
    }
    return true;
  };

  // Period-based: sum credits from approved task_logs only
  const memberIds = members.map((m) => m.id);
  const query = supabase
    .from('task_logs')
    .select('user_id, credits_awarded, notes')
    .in('user_id', memberIds);

  if (dateFilter) query.gte('completed_at', dateFilter);
  const { data: logs } = await query;

  const creditMap: Record<string, number> = {};
  members.forEach((m) => (creditMap[m.id] = 0));
  logs?.forEach((l) => {
    if (isApprovedLog(l.notes)) {
      creditMap[l.user_id] = (creditMap[l.user_id] ?? 0) + (l.credits_awarded ?? 0);
    }
  });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Fetch past weekly resets within last 30 days
  const { data: pastResets } = await supabase
    .from('weekly_resets')
    .select('winner_id, winner_credits, loser_id, loser_credits')
    .eq('house_id', houseId)
    .gte('announced_at', thirtyDaysAgo.toISOString());

  const resetCreditMap: Record<string, number> = {};
  pastResets?.forEach((r: any) => {
    if (r.winner_id) resetCreditMap[r.winner_id] = (resetCreditMap[r.winner_id] ?? 0) + (r.winner_credits ?? 0);
    if (r.loser_id) resetCreditMap[r.loser_id] = (resetCreditMap[r.loser_id] ?? 0) + (r.loser_credits ?? 0);
  });

  const leaderboard = members
    .map((m: any) => {
      let credits = creditMap[m.id] ?? 0;
      const resetCredits = (resetCreditMap[m.id] ?? 0) + (m.weekly_xp ?? 0);
      credits = Math.max(credits, resetCredits);

      const joinDate = m.created_at ? new Date(m.created_at) : null;
      if (joinDate && joinDate >= thirtyDaysAgo) {
        credits = Math.max(credits, m.xp ?? m.total_credits ?? 0);
      } else {
        credits = Math.max(credits, m.weekly_xp ?? 0);
      }
      return { ...m, periodCredits: credits };
    })
    .sort((a, b) => b.periodCredits - a.periodCredits)
    .map((m, i) => ({ ...m, rank: i + 1 }));

  res.json({ leaderboard });
});

export default router;
