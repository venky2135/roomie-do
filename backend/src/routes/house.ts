import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { supabase } from '../supabaseClient';

const router = Router();

// Generate random 6-char invite code
const generateInviteCode = (): string => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// Default task templates seeded when a house is created
const DEFAULT_TASKS = [
  { name: 'Cook a Meal', icon: '🍳', category: 'Kitchen', base_credits: 50 },
  { name: 'Wash Dishes', icon: '🍽️', category: 'Kitchen', base_credits: 20 },
  { name: 'Clean Kitchen', icon: '🧽', category: 'Kitchen', base_credits: 30 },
  { name: 'Vacuum', icon: '🧹', category: 'Cleaning', base_credits: 30 },
  { name: 'Mop Floor', icon: '🪣', category: 'Cleaning', base_credits: 25 },
  { name: 'Clean Bathroom', icon: '🚿', category: 'Cleaning', base_credits: 35 },
  { name: 'Do Laundry', icon: '👕', category: 'Laundry', base_credits: 30 },
  { name: 'Iron Clothes', icon: '👔', category: 'Laundry', base_credits: 20 },
  { name: 'Grocery Run', icon: '🛒', category: 'Shopping', base_credits: 40 },
  { name: 'Take Out Trash', icon: '🗑️', category: 'General', base_credits: 15 },
];

// POST /api/house/create
router.post('/create', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { houseName } = req.body;

  if (!houseName) {
    res.status(400).json({ error: 'houseName is required' });
    return;
  }

  const inviteCode = generateInviteCode();

  // Create house
  const { data: house, error: houseError } = await supabase
    .from('houses')
    .insert({ name: houseName, invite_code: inviteCode, admin_id: userId })
    .select()
    .single();

  if (houseError) {
    res.status(500).json({ error: houseError.message });
    return;
  }

  // Update user profile: set house_id and is_admin
  await supabase
    .from('profiles')
    .update({ house_id: house.id, is_admin: true })
    .eq('id', userId);

  // Seed default task templates
  const tasks = DEFAULT_TASKS.map((t) => ({
    ...t,
    house_id: house.id,
    photo_required: false,
    is_active: true,
  }));
  await supabase.from('task_templates').insert(tasks);

  res.json({ house, inviteCode });
});

// POST /api/house/join
router.post('/join', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { inviteCode } = req.body;

  if (!inviteCode) {
    res.status(400).json({ error: 'inviteCode is required' });
    return;
  }

  const { data: house, error } = await supabase
    .from('houses')
    .select('*')
    .eq('invite_code', inviteCode.toUpperCase())
    .single();

  if (error || !house) {
    res.status(404).json({ error: 'Invalid invite code' });
    return;
  }

  // Check if already in a house
  const { data: profile } = await supabase
    .from('profiles')
    .select('house_id')
    .eq('id', userId)
    .single();

  if (profile?.house_id) {
    res.status(400).json({ error: 'You are already in a house' });
    return;
  }

  await supabase
    .from('profiles')
    .update({ house_id: house.id, is_admin: false })
    .eq('id', userId);

  res.json({ house });
});

// POST /api/house/regenerate-code — Admin only
router.post('/regenerate-code', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, house_id')
    .eq('id', userId)
    .single();

  if (!profile?.is_admin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  const newCode = generateInviteCode();
  await supabase
    .from('houses')
    .update({ invite_code: newCode })
    .eq('id', profile.house_id);

  res.json({ inviteCode: newCode });
});

// DELETE /api/house/member/:memberId — Admin removes a member
router.delete('/member/:memberId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { memberId } = req.params;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, house_id')
    .eq('id', userId)
    .single();

  if (!profile?.is_admin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  await supabase
    .from('profiles')
    .update({ house_id: null, is_admin: false })
    .eq('id', memberId)
    .eq('house_id', profile.house_id);

  res.json({ success: true });
});

export default router;

