import cron from 'node-cron';
import { WeeklyResetService } from '../services/weeklyResetService';
import { NotificationQueueService } from '../services/notificationQueueService';

/**
 * Sunday Reset Cron & Catch-up System:
 * - Runs every Sunday at 8:00 AM IST (02:30 UTC).
 * - Also performs catch-up on server boot or when awakened by mobile client.
 */
export const startWeeklyCron = () => {
  // Sunday 8:00 AM IST (02:30 UTC)
  cron.schedule('30 2 * * 0', async () => {
    console.log('🏆 Sunday 8:00 AM: Running weekly champion & loser ceremony...');
    await WeeklyResetService.checkAndRunAllPendingWeeklyResets();
    await NotificationQueueService.flushQueue();
  });

  // Catch-up check immediately when server boots up / resumes from sleep
  setTimeout(async () => {
    try {
      console.log('🔄 Server wake-up: Flushing pending notifications & checking weekly resets...');
      await NotificationQueueService.flushQueue();

      const now = new Date();
      // If today is Sunday (0), check and run any unannounced weekly resets
      if (now.getUTCDay() === 0) {
        await WeeklyResetService.checkAndRunAllPendingWeeklyResets();
      }
    } catch (e) {
      console.warn('[WeeklyReset] Boot catch-up error:', e);
    }
  }, 3000);

  console.log('📅 Weekly reset & queue system active (Every Sunday 8AM IST + Wake-up Catch-up)');
};
