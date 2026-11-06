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
        .select('id, username, avatar_url, total_credits, xp, level, streak_days, weekly_xp')
        .eq('house_id', houseId);
    if (!members) {
        res.json({ leaderboard: [] });
        return;
    }
    if (period === 'week') {
        // Weekly: use dedicated weekly_xp column from profile
        const sorted = [...members]
            .sort((a, b) => (b.weekly_xp ?? 0) - (a.weekly_xp ?? 0))
            .map((m, i) => ({ ...m, rank: i + 1, periodCredits: m.weekly_xp ?? 0 }));
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
    const isApprovedLog = (notes) => {
        if (!notes)
            return true; // legacy logs without metadata are treated as completed
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
        }
        catch {
            return true;
        }
        return true;
    };
    // Period-based: sum credits from approved task_logs only
    const memberIds = members.map((m) => m.id);
    const query = supabaseClient_1.supabase
        .from('task_logs')
        .select('user_id, credits_awarded, notes')
        .in('user_id', memberIds);
    if (dateFilter)
        query.gte('completed_at', dateFilter);
    const { data: logs } = await query;
    const creditMap = {};
    members.forEach((m) => (creditMap[m.id] = 0));
    logs?.forEach((l) => {
        if (isApprovedLog(l.notes)) {
            creditMap[l.user_id] = (creditMap[l.user_id] ?? 0) + (l.credits_awarded ?? 0);
        }
    });
    const leaderboard = members
        .map((m) => ({ ...m, periodCredits: creditMap[m.id] ?? 0 }))
        .sort((a, b) => b.periodCredits - a.periodCredits)
        .map((m, i) => ({ ...m, rank: i + 1 }));
    res.json({ leaderboard });
});
exports.default = router;
