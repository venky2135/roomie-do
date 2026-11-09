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
      console.log('🔄 Server wake-up: Flushing pending notifications...');
      await NotificationQueueService.flushQueue();

      // STRICT CHECK: Weekly reset ONLY runs on Sunday (IST). Never on Monday or other days.
      if (WeeklyResetService.isSundayIST()) {
        console.log('🏆 Server wake-up on Sunday: Checking pending weekly resets...');
        await WeeklyResetService.checkAndRunAllPendingWeeklyResets();
      }
    } catch (e) {
      console.warn('[WeeklyReset] Boot catch-up error:', e);
    }
  }, 3000);

  console.log('📅 Weekly reset & queue system active (Every Sunday 8AM IST + Sunday Wake-up Catch-up)');
};
