import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { supabase } from '../supabaseClient';
import { calculateFairnessScore } from '../services/fairnessService';

const router = Router();

// GET /api/analytics/:houseId
router.get('/:houseId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { houseId } = req.params;
  const userId = req.userId!;

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const monthAgo = new Date();
  monthAgo.setMonth(monthAgo.getMonth() - 1);

  // Get user's profile to check house membership
  const { data: profile } = await supabase
    .from('profiles')
    .select('house_id')
    .eq('id', userId)
    .single();

  if (profile?.house_id !== houseId) {
    res.status(403).json({ error: 'Not a member of this house' });
    return;
  }

  // Member list for this house
  const { data: members } = await supabase
    .from('profiles')
    .select('id')
    .eq('house_id', houseId);
  const memberIds = members?.map((m) => m.id) ?? [];

  const isApprovedLog = (notes: string | null | undefined): boolean => {
    if (!notes) return true;
    try {
      const parsed = JSON.parse(notes);
      if (typeof parsed === 'object' && parsed !== null) {
        if (parsed.type === 'leave_request') return parsed.status === 'approved';
        if (parsed.status === 'pending_verification') return false;
        if (parsed.status === 'completed') return true;
      }
    } catch {}
    return true;
  };

  // Weekly category breakdown (approved logs only)
  const { data: weeklyLogs } = await supabase
    .from('task_logs')
    .select('credits_awarded, task_id, notes, task_templates(category, name)')
    .in('user_id', memberIds)
    .gte('completed_at', weekAgo.toISOString());

  const categoryMap: Record<string, number> = {};
  weeklyLogs?.forEach((log: any) => {
    if (isApprovedLog(log.notes)) {
      const cat = log.task_templates?.category ?? 'Other';
      categoryMap[cat] = (categoryMap[cat] ?? 0) + (log.credits_awarded ?? 0);
    }
  });

  // Personal stats for requesting user (approved logs only)
  const { data: myLogs } = await supabase
    .from('task_logs')
    .select('credits_awarded, completed_at, notes, task_templates(name, icon)')
    .eq('user_id', userId)
    .gte('completed_at', monthAgo.toISOString())
    .order('completed_at', { ascending: true });

  // Daily credits trend (last 7 days)
  const dailyMap: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dailyMap[d.toISOString().split('T')[0]] = 0;
  }
  myLogs?.forEach((log: any) => {
    if (isApprovedLog(log.notes)) {
      const day = log.completed_at.split('T')[0];
      if (dailyMap[day] !== undefined) {
        dailyMap[day] += log.credits_awarded ?? 0;
      }
    }
  });

  // Fairness score
  const fairness = await calculateFairnessScore(houseId as string);

  res.json({
    categoryBreakdown: Object.entries(categoryMap).map(([category, credits]) => ({
      category,
      credits,
    })),
    dailyCredits: Object.entries(dailyMap).map(([date, credits]) => ({ date, credits })),
    fairness,
    recentActivity: myLogs?.slice(-10).reverse() ?? [],
  });
});

export default router;

