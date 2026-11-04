import { NotificationService } from './notificationService';
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
  /**
   * Pick a random witty message.
   */
  static getRandomMessage(): ZomatoMessage {
    const randomIndex = Math.floor(Math.random() * ZOMATO_MESSAGES.length);
    return ZOMATO_MESSAGES[randomIndex];
  }

  /**
   * Broadcast a random Zomato-style nudge to all active houses.
   */
  static async broadcastRandomNudgeToAll(): Promise<{ housesNotified: number; totalSent: number }> {
    const { data: houses } = await supabase.from('houses').select('id, name');
    if (!houses || houses.length === 0) {
      return { housesNotified: 0, totalSent: 0 };
    }

    const message = this.getRandomMessage();
    let totalSent = 0;
    let housesNotified = 0;

    for (const house of houses) {
      const result = await NotificationService.sendToHouse(house.id, {
        title: message.title,
        body: message.body,
        data: {
          type: 'zomato_nudge',
          timestamp: new Date().toISOString(),
        },
      });

      if (result.successCount > 0) {
        totalSent += result.successCount;
        housesNotified++;
      }
    }

    console.log(`[ZomatoPush] Delivered "${message.title}" to ${totalSent} devices across ${housesNotified} house(s).`);
    return { housesNotified, totalSent };
  }

  /**
   * Send a random Zomato-style nudge to a specific house.
   */
  static async sendNudgeToHouse(houseId: string, customMessage?: ZomatoMessage) {
    const message = customMessage || this.getRandomMessage();
    return NotificationService.sendToHouse(houseId, {
      title: message.title,
      body: message.body,
      data: {
        type: 'zomato_nudge',
        timestamp: new Date().toISOString(),
      },
    });
  }
}

