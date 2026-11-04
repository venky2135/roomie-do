import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { supabase } from '../supabaseClient';
import { calculateCredits } from '../services/creditService';
import { checkAndAwardBadges } from '../services/badgeService';

const router = Router();

// POST /api/tasks/log — Log a completed task
router.post('/log', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { taskId, notes, photoUrl, isHighPriority } = req.body;

  if (!taskId) {
    res.status(400).json({ error: 'taskId is required' });
    return;
  }

  // Fetch task template to get base_credits and house_id
  const { data: task, error: taskError } = await supabase
    .from('task_templates')
    .select('id, name, base_credits, house_id, photo_required')
    .eq('id', taskId)
    .single();

  if (taskError || !task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  // Verify user belongs to that house
  const { data: profile } = await supabase
    .from('profiles')
    .select('house_id')
    .eq('id', userId)
    .single();

  if (profile?.house_id !== task.house_id) {
    res.status(403).json({ error: 'Task does not belong to your house' });
    return;
  }

  // Calculate potential credits (awarded only upon roommate approval)
  let creditsAwarded = task.base_credits;
  if (photoUrl) creditsAwarded += 5;
  if (isHighPriority) creditsAwarded += 15;

  const logMetadata = {
    note: (notes ?? '').trim(),
    status: 'pending_verification',
    feedbacks: [],
  };

  // Insert task log with pending_verification state
  const { data: log, error: logError } = await supabase
    .from('task_logs')
    .insert({
      user_id: userId,
      task_id: taskId,
      credits_awarded: creditsAwarded,
      photo_url: photoUrl ?? null,
      notes: JSON.stringify(logMetadata),
      completed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (logError) {
    res.status(500).json({ error: 'Failed to log task', details: logError.message });
    return;
  }

  res.json({
    success: true,
    log,
    message: 'Chore logged and pending roommate approval',
  });
});

// POST /api/tasks/verify/:logId — Approve a task log and award XP
router.post('/verify/:logId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { logId } = req.params;

  const { data: log, error: logError } = await supabase
    .from('task_logs')
    .select('*, profiles(id, xp, total_credits, streak_days)')
    .eq('id', logId)
    .single();

  if (logError || !log) {
    res.status(404).json({ error: 'Task log not found' });
    return;
  }

  if (log.user_id === userId) {
    res.status(400).json({ error: 'You cannot approve your own chore' });
    return;
  }

  const { data: approver } = await supabase
    .from('profiles')
    .select('house_id, username')
    .eq('id', userId)
    .single();

  const { data: creator } = await supabase
    .from('profiles')
    .select('house_id, xp, total_credits')
    .eq('id', log.user_id)
    .single();

  if (!approver || !creator || approver.house_id !== creator.house_id) {
    res.status(403).json({ error: 'Not a member of the same house' });
    return;
  }

  let meta: any = {};
  try {
    meta = JSON.parse(log.notes);
  } catch {
    meta = { note: log.notes || '' };
  }

  if (meta.status === 'completed') {
    res.status(400).json({ error: 'Task is already approved' });
    return;
  }

  meta.status = 'completed';
  meta.verifiedBy = userId;
  meta.verifiedByName = approver.username;
  meta.verifiedAt = new Date().toISOString();

  await supabase
    .from('task_logs')
    .update({ notes: JSON.stringify(meta) })
    .eq('id', logId);

  // Award XP and total credits to task creator
  const award = log.credits_awarded || 20;
  const newXp = (creator.xp || 0) + award;
  const newTotal = (creator.total_credits || 0) + award;
  const newLevel = Math.floor(newXp / 500) + 1;

  await supabase
    .from('profiles')
    .update({
      xp: newXp,
      total_credits: newTotal,
      level: newLevel,
      last_active_at: new Date().toISOString(),
    })
    .eq('id', log.user_id);

  // Check badges for creator
  const newBadges = await checkAndAwardBadges(log.user_id, creator.house_id);

  res.json({
    success: true,
    awardedCredits: award,
    newBadges,
  });
});

// GET /api/tasks/:houseId — List active tasks for a house
router.get('/:houseId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { houseId } = req.params;

  const { data, error } = await supabase
    .from('task_templates')
    .select('*')
    .eq('house_id', houseId)
    .eq('is_active', true)
    .neq('category', 'Marketplace')
    .neq('category', 'Leave')
    .neq('category', 'WeeklyStakes')
    .order('category');

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ tasks: data });
});

// POST /api/tasks/admin/upsert — Admin creates/updates a task template
router.post('/admin/upsert', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { id, houseId, name, icon, category, baseCredits, photoRequired } = req.body;

  // Verify admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, house_id')
    .eq('id', userId)
    .single();

  if (!profile?.is_admin || profile.house_id !== houseId) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  const payload = {
    house_id: houseId,
    name,
    icon: icon ?? '🧹',
    category: category ?? 'General',
    base_credits: baseCredits ?? 20,
    photo_required: photoRequired ?? false,
    is_active: true,
  };

  const { data, error } = id
    ? await supabase.from('task_templates').update(payload).eq('id', id).select().single()
    : await supabase.from('task_templates').insert(payload).select().single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ task: data });
});

// PATCH /api/tasks/admin/toggle/:taskId — Admin toggle task active/inactive
router.patch('/admin/toggle/:taskId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { taskId } = req.params;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single();

  if (!profile?.is_admin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  const { data: task } = await supabase
    .from('task_templates')
    .select('is_active')
    .eq('id', taskId)
    .single();

  const { data, error } = await supabase
    .from('task_templates')
    .update({ is_active: !task?.is_active })
    .eq('id', taskId)
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ task: data });
});

export default router;

