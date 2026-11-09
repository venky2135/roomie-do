import cron from 'node-cron';
import { ZomatoNotificationService } from '../services/zomatoNotificationService';

/**
 * Schedules periodic Zomato-style witty notifications:
 * - 1:00 PM IST (07:30 UTC): Lunchtime check-in
 * - 7:30 PM IST (14:00 UTC): Evening clean-up banter
 * - Saturday 11:00 AM IST (05:30 UTC): Weekend warrior reminder
 */
export const startZomatoCron = () => {
  // 1:00 PM IST daily (07:30 UTC)
  cron.schedule('30 7 * * *', async () => {
    console.log('🍕 Running Zomato-style midday chore nudge...');
    await ZomatoNotificationService.broadcastRandomNudgeToAll();
  });

  // 7:30 PM IST daily (14:00 UTC)
  cron.schedule('0 14 * * *', async () => {
    console.log('🍕 Running Zomato-style evening chore banter...');
    await ZomatoNotificationService.broadcastRandomNudgeToAll();
  });

  // Saturday 11:00 AM IST (05:30 UTC)
  cron.schedule('30 5 * * 6', async () => {
    console.log('🍕 Running Zomato-style weekend clean-up special...');
    await ZomatoNotificationService.broadcastRandomNudgeToAll();
  });

  // Catch-up check when server boots up / wakes up from Render sleep
  setTimeout(async () => {
    try {
      console.log('🍕 Server wake-up: Checking pending daily promotional nudges...');
      await ZomatoNotificationService.checkAndRunPendingDailyNudge();
    } catch (e) {
      console.warn('[ZomatoCron] Boot catch-up error:', e);
    }
  }, 4000);

  console.log('🔔 Zomato-style notifications scheduled (Midday 1PM IST, Evening 7:30PM IST, Saturday 11AM IST + Wake-up Catch-up)');
};

