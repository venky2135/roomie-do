"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const supabaseClient_1 = require("../supabaseClient");
const fairnessService_1 = require("../services/fairnessService");
const router = (0, express_1.Router)();
// GET /api/analytics/:houseId
router.get('/:houseId', authMiddleware_1.authMiddleware, async (req, res) => {
    const { houseId } = req.params;
    const userId = req.userId;
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    // Get user's profile to check house membership
    const { data: profile } = await supabaseClient_1.supabase
        .from('profiles')
        .select('house_id')
        .eq('id', userId)
        .single();
    if (profile?.house_id !== houseId) {
        res.status(403).json({ error: 'Not a member of this house' });
        return;
    }
    // Member list for this house
    const { data: members } = await supabaseClient_1.supabase
        .from('profiles')
        .select('id')
        .eq('house_id', houseId);
    const memberIds = members?.map((m) => m.id) ?? [];
    // Weekly category breakdown
    const { data: weeklyLogs } = await supabaseClient_1.supabase
        .from('task_logs')
        .select('credits_awarded, task_id, task_templates(category, name)')
        .in('user_id', memberIds)
        .gte('completed_at', weekAgo.toISOString());
    const categoryMap = {};
    weeklyLogs?.forEach((log) => {
        const cat = log.task_templates?.category ?? 'Other';
        categoryMap[cat] = (categoryMap[cat] ?? 0) + log.credits_awarded;
    });
    // Personal stats for requesting user
    const { data: myLogs } = await supabaseClient_1.supabase
        .from('task_logs')
        .select('credits_awarded, completed_at, task_templates(name, icon)')
        .eq('user_id', userId)
        .gte('completed_at', monthAgo.toISOString())
        .order('completed_at', { ascending: true });
    // Daily credits trend (last 7 days)
    const dailyMap = {};
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dailyMap[d.toISOString().split('T')[0]] = 0;
    }
    myLogs?.forEach((log) => {
        const day = log.completed_at.split('T')[0];
        if (dailyMap[day] !== undefined) {
            dailyMap[day] += log.credits_awarded;
        }
    });
    // Fairness score
    const fairness = await (0, fairnessService_1.calculateFairnessScore)(houseId);
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
exports.default = router;
