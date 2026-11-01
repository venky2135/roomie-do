"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAndAwardBadges = void 0;
const supabaseClient_1 = require("../supabaseClient");
const checkAndAwardBadges = async (userId, houseId) => {
    const awarded = [];
    // Fetch all badges not yet earned by user
    const { data: earnedBadges } = await supabaseClient_1.supabase
        .from('user_badges')
        .select('badge_id')
        .eq('user_id', userId);
    const earnedIds = earnedBadges?.map((b) => b.badge_id) ?? [];
    const { data: allBadges } = await supabaseClient_1.supabase.from('badges').select('*');
    if (!allBadges)
        return awarded;
    const unearnedBadges = allBadges.filter((b) => !earnedIds.includes(b.id));
    // Fetch profile stats
    const { data: profile } = await supabaseClient_1.supabase
        .from('profiles')
        .select('total_credits, xp, streak_days, level')
        .eq('id', userId)
        .single();
    // Fetch total task logs for user
    const { count: taskCount } = await supabaseClient_1.supabase
        .from('task_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
    for (const badge of unearnedBadges) {
        let earned = false;
        switch (badge.condition_type) {
            case 'tasks_count':
                earned = (taskCount ?? 0) >= badge.condition_value;
                break;
            case 'streak_days':
                earned = (profile?.streak_days ?? 0) >= badge.condition_value;
                break;
            case 'total_credits':
                earned = (profile?.total_credits ?? 0) >= badge.condition_value;
                break;
            case 'level':
                earned = (profile?.level ?? 1) >= badge.condition_value;
                break;
        }
        if (earned) {
            await supabaseClient_1.supabase.from('user_badges').insert({
                user_id: userId,
                badge_id: badge.id,
                earned_at: new Date().toISOString(),
            });
            awarded.push(badge);
        }
    }
    return awarded;
};
exports.checkAndAwardBadges = checkAndAwardBadges;
