import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { supabase } from '../supabaseClient';

const router = Router();

// POST /api/nudge — Send a nudge to a roommate
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const fromUserId = req.userId!;
  const { toUserId } = req.body;

  if (!toUserId) {
    res.status(400).json({ error: 'toUserId is required' });
    return;
  }

  // Verify both users are in the same house
  const { data: fromProfile } = await supabase
    .from('profiles')
    .select('house_id, username')
    .eq('id', fromUserId)
    .single();

  const { data: toProfile } = await supabase
    .from('profiles')
    .select('house_id')
    .eq('id', toUserId)
    .single();

  if (!fromProfile || !toProfile || fromProfile.house_id !== toProfile.house_id) {
    res.status(403).json({ error: 'Users are not in the same house' });
    return;
  }

  // Record nudge
  await supabase.from('nudges').insert({
    from_user_id: fromUserId,
    to_user_id: toUserId,
    sent_at: new Date().toISOString(),
  });

  // Push notification would be triggered here (Expo push tokens)
  // For now, the mobile app polls for nudges via Supabase Realtime

  res.json({
    success: true,
    message: `Nudge sent from ${fromProfile.username}`,
  });
});

export default router;

