"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWeeklyCron = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const weeklyResetService_1 = require("../services/weeklyResetService");
const notificationQueueService_1 = require("../services/notificationQueueService");
/**
 * Sunday Reset Cron & Catch-up System:
 * - Runs every Sunday at 8:00 AM IST (02:30 UTC).
 * - Also performs catch-up on server boot or when awakened by mobile client.
 */
const startWeeklyCron = () => {
    // Sunday 8:00 AM IST (02:30 UTC)
    node_cron_1.default.schedule('30 2 * * 0', async () => {
        console.log('🏆 Sunday 8:00 AM: Running weekly champion & loser ceremony...');
        await weeklyResetService_1.WeeklyResetService.checkAndRunAllPendingWeeklyResets();
        await notificationQueueService_1.NotificationQueueService.flushQueue();
    });
    // Catch-up check immediately when server boots up / resumes from sleep
    setTimeout(async () => {
        try {
            console.log('🔄 Server wake-up: Flushing pending notifications & checking weekly resets...');
            await notificationQueueService_1.NotificationQueueService.flushQueue();
            const now = new Date();
            // If today is Sunday (0) or Monday (1), check and run any unannounced weekly resets
            if (now.getUTCDay() === 0 || now.getUTCDay() === 1) {
                await weeklyResetService_1.WeeklyResetService.checkAndRunAllPendingWeeklyResets();
            }
        }
        catch (e) {
            console.warn('[WeeklyReset] Boot catch-up error:', e);
        }
    }, 3000);
    console.log('📅 Weekly reset & queue system active (Every Sunday 8AM IST + Wake-up Catch-up)');
};
exports.startWeeklyCron = startWeeklyCron;
