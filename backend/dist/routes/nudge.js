"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const supabaseClient_1 = require("../supabaseClient");
const router = (0, express_1.Router)();
// POST /api/nudge — Send a nudge to a roommate
router.post('/', authMiddleware_1.authMiddleware, async (req, res) => {
    const fromUserId = req.userId;
    const { toUserId } = req.body;
    if (!toUserId) {
        res.status(400).json({ error: 'toUserId is required' });
        return;
    }
    // Verify both users are in the same house
    const { data: fromProfile } = await supabaseClient_1.supabase
        .from('profiles')
        .select('house_id, username')
        .eq('id', fromUserId)
        .single();
    const { data: toProfile } = await supabaseClient_1.supabase
        .from('profiles')
        .select('house_id')
        .eq('id', toUserId)
        .single();
    if (!fromProfile || !toProfile || fromProfile.house_id !== toProfile.house_id) {
        res.status(403).json({ error: 'Users are not in the same house' });
        return;
    }
    // Record nudge
    await supabaseClient_1.supabase.from('nudges').insert({
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
exports.default = router;
