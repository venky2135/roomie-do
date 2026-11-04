"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateFairnessScore = void 0;
const supabaseClient_1 = require("../supabaseClient");
const calculateFairnessScore = async (houseId) => {
    // Get all members
    const { data: members } = await supabaseClient_1.supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .eq('house_id', houseId);
    if (!members || members.length === 0) {
        return { score: 100, memberBreakdown: [] };
    }
    // Get this week's task logs for the house
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const memberIds = members.map((m) => m.id);
    const { data: logs } = await supabaseClient_1.supabase
        .from('task_logs')
        .select('user_id, credits_awarded, notes')
        .in('user_id', memberIds)
        .gte('completed_at', weekAgo.toISOString());
    const isApprovedLog = (notes) => {
        if (!notes)
            return true;
        try {
            const parsed = JSON.parse(notes);
            if (typeof parsed === 'object' && parsed !== null) {
                if (parsed.type === 'leave_request')
                    return parsed.status === 'approved';
                if (parsed.status === 'pending_verification')
                    return false;
                if (parsed.status === 'completed')
                    return true;
            }
        }
        catch { }
        return true;
    };
    // Sum credits per member for approved logs only
    const creditMap = {};
    members.forEach((m) => (creditMap[m.id] = 0));
    logs?.forEach((l) => {
        if (isApprovedLog(l.notes)) {
            creditMap[l.user_id] = (creditMap[l.user_id] ?? 0) + (l.credits_awarded ?? 0);
        }
    });
    const totalCredits = Object.values(creditMap).reduce((a, b) => a + b, 0);
    const idealShare = totalCredits / members.length;
    // Gini-style fairness: deviation from ideal
    let totalDeviation = 0;
    const breakdown = members.map((m) => {
        const credits = creditMap[m.id] ?? 0;
        totalDeviation += Math.abs(credits - idealShare);
        return {
            userId: m.id,
            username: m.username,
            avatarUrl: m.avatar_url,
            weeklyCredits: credits,
            sharePercent: totalCredits > 0 ? Math.round((credits / totalCredits) * 100) : 0,
        };
    });
    // Score: 100 when perfect, drops with deviation
    const maxDeviation = idealShare * members.length;
    const score = maxDeviation > 0
        ? Math.max(0, Math.round(100 - (totalDeviation / maxDeviation) * 100))
        : 100;
    return { score, memberBreakdown: breakdown };
};
exports.calculateFairnessScore = calculateFairnessScore;
