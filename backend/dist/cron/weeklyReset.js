"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWeeklyCron = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const supabaseClient_1 = require("../supabaseClient");
// Runs every Sunday at 8:00 AM (IST = UTC+5:30, so 2:30 AM UTC)
const startWeeklyCron = () => {
    node_cron_1.default.schedule('30 2 * * 0', async () => {
        console.log('🏆 Running weekly champion selection...');
        // Get all houses
        const { data: houses } = await supabaseClient_1.supabase.from('houses').select('id, name');
        if (!houses)
            return;
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        for (const house of houses) {
            // Get members
            const { data: members } = await supabaseClient_1.supabase
                .from('profiles')
                .select('id')
                .eq('house_id', house.id);
            if (!members || members.length === 0)
                continue;
            const memberIds = members.map((m) => m.id);
            // Get weekly logs
            const { data: logs } = await supabaseClient_1.supabase
                .from('task_logs')
                .select('user_id, credits_awarded')
                .in('user_id', memberIds)
                .gte('completed_at', weekAgo.toISOString());
            if (!logs || logs.length === 0)
                continue;
            // Sum credits per member
            const creditMap = {};
            logs.forEach((l) => {
                creditMap[l.user_id] = (creditMap[l.user_id] ?? 0) + l.credits_awarded;
            });
            // Find champion (highest credits this week)
            const championId = Object.entries(creditMap).sort((a, b) => b[1] - a[1])[0]?.[0];
            if (!championId)
                continue;
            // Award weekly champion badge bonus (50 bonus credits)
            await supabaseClient_1.supabase.rpc('award_bonus_credits', {
                p_user_id: championId,
                p_credits: 50,
            }).then(() => {
                console.log(`👑 Weekly champion for house ${house.name}: ${championId}`);
            });
        }
    });
    console.log('📅 Weekly cron job scheduled (every Sunday 8AM IST)');
};
exports.startWeeklyCron = startWeeklyCron;
