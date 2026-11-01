"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const supabaseClient_1 = require("../supabaseClient");
const router = (0, express_1.Router)();
// GET /api/leaderboard/:houseId
router.get('/:houseId', authMiddleware_1.authMiddleware, async (req, res) => {
    const { houseId } = req.params;
    const rawPeriod = req.query.period;
    const period = Array.isArray(rawPeriod) ? rawPeriod[0] : (rawPeriod ?? 'week');
    let dateFilter = null;
    if (period === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        dateFilter = weekAgo.toISOString();
    }
    else if (period === 'month') {
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        dateFilter = monthAgo.toISOString();
    }
    // Get members
    const { data: members } = await supabaseClient_1.supabase
        .from('profiles')
        .select('id, username, avatar_url, total_credits, xp, level, streak_days')
        .eq('house_id', houseId);
    if (!members) {
        res.json({ leaderboard: [] });
        return;
    }
    if (period === 'all') {
        // All-time: use total_credits from profile
        const sorted = [...members].sort((a, b) => b.total_credits - a.total_credits);
        res.json({
            leaderboard: sorted.map((m, i) => ({ ...m, rank: i + 1, periodCredits: m.total_credits })),
        });
        return;
    }
    // Period-based: sum credits from task_logs
    const memberIds = members.map((m) => m.id);
    const query = supabaseClient_1.supabase
        .from('task_logs')
        .select('user_id, credits_awarded')
        .in('user_id', memberIds);
    if (dateFilter)
        query.gte('completed_at', dateFilter);
    const { data: logs } = await query;
    const creditMap = {};
    members.forEach((m) => (creditMap[m.id] = 0));
    logs?.forEach((l) => {
        creditMap[l.user_id] = (creditMap[l.user_id] ?? 0) + l.credits_awarded;
    });
    const leaderboard = members
        .map((m) => ({ ...m, periodCredits: creditMap[m.id] ?? 0 }))
        .sort((a, b) => b.periodCredits - a.periodCredits)
        .map((m, i) => ({ ...m, rank: i + 1 }));
    res.json({ leaderboard });
});
exports.default = router;
