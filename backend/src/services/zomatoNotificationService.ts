import { NotificationService } from './notificationService';
import { NotificationQueueService } from './notificationQueueService';
import { supabase } from '../supabaseClient';

export interface ZomatoMessage {
  title: string;
  body: string;
}

export const ZOMATO_MESSAGES: ZomatoMessage[] = [
  {
    title: 'The sink sent a friend request 🍽️',
    body: 'Those dishes are forming a whole new civilization. Time for a soap intervention!',
  },
  {
    title: 'Trash talk time 🗑️👀',
    body: 'That bin is fuller than our weekend schedule. Take it out before it walks out itself!',
  },
  {
    title: 'A wild dust bunny appeared! 🐰🌪️',
    body: 'Swipe right on your broom to defeat it and claim that sweet house XP.',
  },
  {
    title: 'Dishes update: 0% progress ⏱️🫧',
    body: 'We watched them for 2 hours. Turns out they really don’t wash themselves.',
  },
  {
    title: 'Roomie radar alert 🚨😏',
    body: 'Your roommate just logged a chore. Are you really going to let them take #1 on the leaderboard?',
  },
  {
    title: 'Knock, knock! 🚪',
    body: 'Who’s there? Not you doing chores, that’s for sure. Time to change that! 🧹',
  },
  {
    title: 'Your fridge called 🥡🥶',
    body: 'It wants that mystery leftover container from last week evicted immediately.',
  },
  {
    title: 'Weekend Clean-Up Playlist: Queued 🎧✨',
    body: 'Turn up the volume, grab a duster, and let’s rack up those chore credits.',
  },
  {
    title: 'Streak on the line! 🔥',
    body: 'Your streak is hotter than instant ramen. Complete a chore today to keep the fire burning!',
  },
  {
    title: 'The sponge is crying 🧽🥺',
    body: 'It wants purpose. It wants bubbles. Give the counters a quick wipe!',
  },
  {
    title: 'Be the hero your house needs 🦇🧹',
    body: 'Not all heroes wear capes. Some just empty the dishwasher without being asked.',
  },
  {
    title: 'Laundry pile status: Mount Everest 🏔️👕',
    body: 'Scale the peak today before it claims your entire bedroom chair.',
  },
  {
    title: 'Chore points = Roomie respect 👑',
    body: 'Log a quick 5-minute task and secure your bragging rights for dinner.',
  },
  {
    title: 'Psst... we see you procrastinating 📱👀',
    body: 'Put the phone down for 3 minutes, wipe the stove, and come back a champion.',
  },
  {
    title: 'House harmony level: 98% 🏡✨',
    body: 'Complete one quick chore today to reach 100% roommate peace.',
  },
];

export class ZomatoNotificationService {
  private static isCheckingNudge = false;

  /**
   * Determine the current promotional slot based on IST time (UTC+5:30).
   * Defines natural windows during the day:
   * - Midday: 11:30 AM to 4:00 PM IST
   * - Evening: 6:00 PM to 10:30 PM IST
   * - Daytime catch-up: 9:00 AM to 11:00 PM IST
   * - Quiet hours: 11:00 PM to 9:00 AM IST (do not disturb roommates!)
   */
  static getCurrentSlot(): { slotKey: string; slotName: string } | null {
    const istTime = new Date(Date.now() + 5.5 * 3600 * 1000);
    const hours = istTime.getUTCHours();
    const minutes = istTime.getUTCMinutes();
    const timeInMinutes = hours * 60 + minutes;
    const dateStr = istTime.toISOString().slice(0, 10); // YYYY-MM-DD

    // 1. Midday / Lunch window: 11:30 AM (690 min) to 4:00 PM (960 min) IST
    if (timeInMinutes >= 690 && timeInMinutes < 960) {
      return { slotKey: `${dateStr}-midday`, slotName: 'Midday Nudge' };
    }

    // 2. Evening / Dinner window: 6:00 PM (1080 min) to 10:30 PM (1350 min) IST
    if (timeInMinutes >= 1080 && timeInMinutes < 1350) {
      return { slotKey: `${dateStr}-evening`, slotName: 'Evening Nudge' };
    }

    // 3. Daytime catch-up: 9:00 AM (540 min) to 11:00 PM (1380 min) IST
    if (timeInMinutes >= 540 && timeInMinutes < 1380) {
      return { slotKey: `${dateStr}-daily`, slotName: 'Daily Nudge' };
    }

    // Quiet hours (11:00 PM to 9:00 AM IST)
    return null;
  }

  /**
   * Pick a random witty message.
   */
  static getRandomMessage(): ZomatoMessage {
    const randomIndex = Math.floor(Math.random() * ZOMATO_MESSAGES.length);
    return ZOMATO_MESSAGES[randomIndex];
  }

  /**
   * Check and send pending daily promotional nudge across all houses if missed due to Render sleep.
   */
  static async checkAndRunPendingDailyNudge(): Promise<{ sent: boolean; reason?: string }> {
    if (this.isCheckingNudge) {
      return { sent: false, reason: 'Already in progress' };
    }

    this.isCheckingNudge = true;
    try {
      const slot = this.getCurrentSlot();
      if (!slot) {
        return { sent: false, reason: 'Quiet hours (11 PM - 9 AM IST)' };
      }

      const { data: houses } = await supabase.from('houses').select('id, name');
      if (!houses || houses.length === 0) {
        return { sent: false, reason: 'No houses found' };
      }

      let anySent = false;

      for (const house of houses) {
        // 1. Check if a nudge was already sent for this exact slot
        const { data: existingSlotNudge } = await supabase
          .from('notification_queue')
          .select('id')
          .eq('house_id', house.id)
          .eq('data->>type', 'zomato_nudge')
          .eq('data->>slotKey', slot.slotKey)
          .limit(1);

        if (existingSlotNudge && existingSlotNudge.length > 0) {
          continue; // Already delivered for this slot
        }

        // 2. Enforce a minimum 3-hour cooldown so we never spam
        const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
        const { data: recentNudge } = await supabase
          .from('notification_queue')
          .select('id')
          .eq('house_id', house.id)
          .eq('data->>type', 'zomato_nudge')
          .gte('created_at', threeHoursAgo)
          .limit(1);

        if (recentNudge && recentNudge.length > 0) {
          continue; // Sent within last 3 hours
        }

        // 3. Pick random message and enqueue via NotificationQueueService (persistent & sleep-resilient)
        const message = this.getRandomMessage();
        console.log(`[ZomatoPush] Delivering ${slot.slotName} to house "${house.name}": "${message.title}"`);

        await NotificationQueueService.enqueue({
          houseId: house.id,
          title: message.title,
          body: message.body,
          data: {
            type: 'zomato_nudge',
            slotKey: slot.slotKey,
          },
        });

        anySent = true;
      }

      return { sent: anySent };
    } catch (err: any) {
      console.error('[ZomatoPush] Error checking daily nudge:', err);
      return { sent: false, reason: err.message };
    } finally {
      this.isCheckingNudge = false;
    }
  }

  /**
   * Broadcast a random Zomato-style nudge to all active houses.
   */
  static async broadcastRandomNudgeToAll(): Promise<{ housesNotified: number; totalSent: number }> {
    const res = await this.checkAndRunPendingDailyNudge();
    return { housesNotified: res.sent ? 1 : 0, totalSent: res.sent ? 1 : 0 };
  }

  /**
   * Send a random Zomato-style nudge to a specific house.
   */
  static async sendNudgeToHouse(houseId: string, customMessage?: ZomatoMessage) {
    const message = customMessage || this.getRandomMessage();
    const slot = this.getCurrentSlot();
    const slotKey = slot ? slot.slotKey : `manual-${new Date().toISOString().slice(0, 10)}`;

    return NotificationQueueService.enqueue({
      houseId,
      title: message.title,
      body: message.body,
      data: {
        type: 'zomato_nudge',
        slotKey,
      },
    });
  }
}

