"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const supabaseClient_1 = require("../supabaseClient");
const creditService_1 = require("../services/creditService");
const badgeService_1 = require("../services/badgeService");
const router = (0, express_1.Router)();
// POST /api/tasks/log — Log a completed task
router.post('/log', authMiddleware_1.authMiddleware, async (req, res) => {
    const userId = req.userId;
    const { taskId, notes, photoUrl, isHighPriority } = req.body;
    if (!taskId) {
        res.status(400).json({ error: 'taskId is required' });
        return;
    }
    // Fetch task template to get base_credits and house_id
    const { data: task, error: taskError } = await supabaseClient_1.supabase
        .from('task_templates')
        .select('id, name, base_credits, house_id, photo_required')
        .eq('id', taskId)
        .single();
    if (taskError || !task) {
        res.status(404).json({ error: 'Task not found' });
        return;
    }
    // Verify user belongs to that house
    const { data: profile } = await supabaseClient_1.supabase
        .from('profiles')
        .select('house_id')
        .eq('id', userId)
        .single();
    if (profile?.house_id !== task.house_id) {
        res.status(403).json({ error: 'Task does not belong to your house' });
        return;
    }
    // Calculate credits
    const creditResult = await (0, creditService_1.calculateCredits)(userId, task.base_credits, !!photoUrl, !!isHighPriority);
    // Insert task log
    const { data: log, error: logError } = await supabaseClient_1.supabase
        .from('task_logs')
        .insert({
        user_id: userId,
        task_id: taskId,
        credits_awarded: creditResult.creditsAwarded,
        photo_url: photoUrl ?? null,
        notes: notes ?? null,
        completed_at: new Date().toISOString(),
    })
        .select()
        .single();
    if (logError) {
        res.status(500).json({ error: 'Failed to log task', details: logError.message });
        return;
    }
    // Check and award badges
    const newBadges = await (0, badgeService_1.checkAndAwardBadges)(userId, task.house_id);
    res.json({
        success: true,
        log,
        credits: creditResult,
        newBadges,
    });
});
// GET /api/tasks/:houseId — List active tasks for a house
router.get('/:houseId', authMiddleware_1.authMiddleware, async (req, res) => {
    const { houseId } = req.params;
    const { data, error } = await supabaseClient_1.supabase
        .from('task_templates')
        .select('*')
        .eq('house_id', houseId)
        .eq('is_active', true)
        .order('category');
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json({ tasks: data });
});
// POST /api/tasks/admin/upsert — Admin creates/updates a task template
router.post('/admin/upsert', authMiddleware_1.authMiddleware, async (req, res) => {
    const userId = req.userId;
    const { id, houseId, name, icon, category, baseCredits, photoRequired } = req.body;
    // Verify admin
    const { data: profile } = await supabaseClient_1.supabase
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
        ? await supabaseClient_1.supabase.from('task_templates').update(payload).eq('id', id).select().single()
        : await supabaseClient_1.supabase.from('task_templates').insert(payload).select().single();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json({ task: data });
});
// PATCH /api/tasks/admin/toggle/:taskId — Admin toggle task active/inactive
router.patch('/admin/toggle/:taskId', authMiddleware_1.authMiddleware, async (req, res) => {
    const userId = req.userId;
    const { taskId } = req.params;
    const { data: profile } = await supabaseClient_1.supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', userId)
        .single();
    if (!profile?.is_admin) {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }
    const { data: task } = await supabaseClient_1.supabase
        .from('task_templates')
        .select('is_active')
        .eq('id', taskId)
        .single();
    const { data, error } = await supabaseClient_1.supabase
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
exports.default = router;
