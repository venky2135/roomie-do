"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateCredits = exports.calculateLevel = void 0;
const supabaseClient_1 = require("../supabaseClient");
// Calculate level from total XP
const calculateLevel = (xp) => {
    // Every 500 XP = 1 level
    return Math.floor(xp / 500) + 1;
};
exports.calculateLevel = calculateLevel;
const calculateCredits = async (userId, taskBaseCredits, hasPhoto, isHighPriority) => {
    // Fetch profile for streak info
    const { data: profile } = await supabaseClient_1.supabase
        .from('profiles')
        .select('total_credits, xp, streak_days, last_active_at')
        .eq('id', userId)
        .single();
    const streakDays = profile?.streak_days ?? 0;
    const lastActive = profile?.last_active_at
        ? new Date(profile.last_active_at)
        : null;
    // Determine if streak is still valid (active within last 36h)
    const now = new Date();
    const hoursSinceActive = lastActive
        ? (now.getTime() - lastActive.getTime()) / (1000 * 60 * 60)
        : 999;
    const isStreakAlive = hoursSinceActive < 36;
    const effectiveStreak = isStreakAlive ? streakDays : 0;
    // Base credits
    let credits = taskBaseCredits;
    // Streak bonus: +10% per streak day, capped at 100% bonus (2x)
    const streakMultiplier = Math.min(1 + effectiveStreak * 0.1, 2.0);
    const streakBonus = effectiveStreak > 0;
    credits = Math.round(credits * streakMultiplier);
    // Photo proof bonus
    if (hasPhoto)
        credits += 5;
    // High priority bonus
    if (isHighPriority)
        credits += 15;
    const currentCredits = profile?.total_credits ?? 0;
    const currentXp = profile?.xp ?? 0;
    const newTotal = currentCredits + credits;
    const newXp = currentXp + credits;
    const newLevel = (0, exports.calculateLevel)(newXp);
    const newStreak = isStreakAlive ? effectiveStreak + 1 : 1;
    // Update profile
    await supabaseClient_1.supabase
        .from('profiles')
        .update({
        total_credits: newTotal,
        xp: newXp,
        level: newLevel,
        streak_days: newStreak,
        last_active_at: now.toISOString(),
    })
        .eq('id', userId);
    return { creditsAwarded: credits, newTotal, newXp, newLevel, streakBonus };
};
exports.calculateCredits = calculateCredits;
