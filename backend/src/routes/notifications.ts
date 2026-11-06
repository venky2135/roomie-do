import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { NotificationService } from '../services/notificationService';
import { NotificationQueueService } from '../services/notificationQueueService';
import { WeeklyResetService } from '../services/weeklyResetService';
import { ZomatoNotificationService } from '../services/zomatoNotificationService';
import { supabase } from '../supabaseClient';

const router = Router();

// POST /api/notifications/register-token
router.post('/register-token', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { token, deviceType } = req.body;

  if (!token) {
    res.status(400).json({ error: 'FCM token is required' });
    return;
  }

  try {
    await NotificationService.registerToken(userId, token, deviceType || 'android');
    res.json({ success: true, message: 'Device token registered successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to register device token' });
  }
});

// DELETE /api/notifications/unregister-token
router.delete('/unregister-token', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { token } = req.body;

  if (!token) {
    res.status(400).json({ error: 'FCM token is required' });
    return;
  }

  try {
    await NotificationService.unregisterToken(userId, token);
    res.json({ success: true, message: 'Device token unregistered successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to unregister device token' });
  }
});

// POST /api/notifications/notify-chore-logged — Broadcast to housemates when a user logs a chore
router.post('/notify-chore-logged', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { taskId, logId, taskName = 'a chore' } = req.body;

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('house_id, username')
      .eq('id', userId)
      .single();

    if (!profile || !profile.house_id) {
      res.status(400).json({ error: 'User does not belong to a house' });
      return;
    }

    const result = await NotificationService.sendToHouse(
      profile.house_id,
      {
        title: 'Chore Awaiting Approval 🧹',
        body: `${profile.username} completed "${taskName}". Tap to review and approve!`,
        data: {
          type: 'task_pending_verification',
          logId: String(logId || ''),
          taskId: String(taskId || ''),
        },
      },
      userId
    );

    res.json({ success: true, result });
  } catch (err: any) {
    console.error('Failed to broadcast chore logged notification:', err);
    res.status(500).json({ error: err.message || 'Failed to broadcast chore notification' });
  }
});

// POST /api/notifications/notify-chore-approved — Notify worker when their chore is approved
router.post('/notify-chore-approved', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { logId, workerUserId, taskName = 'chore', award = 20 } = req.body;

  if (!workerUserId) {
    res.status(400).json({ error: 'workerUserId is required' });
    return;
  }

  try {
    const { data: approver } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single();

    const approverName = approver?.username || 'A roommate';

    const result = await NotificationService.sendToUser(workerUserId, {
      title: 'Chore Approved! 🎉',
      body: `${approverName} approved your chore "${taskName}". +${award} XP awarded!`,
      data: {
        type: 'task_approved',
        logId: String(logId || ''),
      },
    });

    res.json({ success: true, result });
  } catch (err: any) {
    console.error('Failed to notify worker of chore approval:', err);
    res.status(500).json({ error: err.message || 'Failed to send approval notification' });
  }
});

// POST /api/notifications/notify-leave-requested — Notify housemates when a roommate requests leave
router.post('/notify-leave-requested', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { logId, duration, reason } = req.body;

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('house_id, username')
      .eq('id', userId)
      .single();

    if (!profile || !profile.house_id) {
      res.status(400).json({ error: 'User does not belong to a house' });
      return;
    }

    const durationText = duration ? `${duration} day(s)` : 'a few days';
    const reasonText = reason ? ` ("${reason}")` : '';

    const result = await NotificationService.sendToHouse(
      profile.house_id,
      {
        title: '🏖️ Roomie Leave Request',
        body: `${profile.username} requested ${durationText} off${reasonText}. Tap to review in Live Feed!`,
        data: {
          type: 'leave_requested',
          logId: String(logId || ''),
        },
      },
      userId
    );

    res.json({ success: true, result });
  } catch (err: any) {
    console.error('Failed to broadcast leave request notification:', err);
    res.status(500).json({ error: err.message || 'Failed to broadcast leave request' });
  }
});

// POST /api/notifications/notify-leave-approved — Notify requester when leave is approved / fully approved
router.post('/notify-leave-approved', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { logId, workerUserId, isFullyApproved, duration } = req.body;

  if (!workerUserId) {
    res.status(400).json({ error: 'workerUserId is required' });
    return;
  }

  try {
    const { data: approver } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single();

    const approverName = approver?.username || 'A roommate';

    const title = isFullyApproved ? '🎉 Leave Fully Approved!' : '👍 Leave Vote Received!';
    const body = isFullyApproved
      ? `Your ${duration ? duration + '-day ' : ''}leave is officially approved by the house! Enjoy your break! 🏖️`
      : `${approverName} voted to approve your leave request. Almost there! 🙌`;

    const result = await NotificationService.sendToUser(workerUserId, {
      title,
      body,
      data: {
        type: 'leave_approved',
        logId: String(logId || ''),
      },
    });

    res.json({ success: true, result });
  } catch (err: any) {
    console.error('Failed to notify leave approval:', err);
    res.status(500).json({ error: err.message || 'Failed to send leave approval notification' });
  }
});

// POST /api/notifications/notify-complaint-raised — Notify housemates when an anonymous complaint is raised
router.post('/notify-complaint-raised', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { logId, accusedUsername, category, title } = req.body;

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('house_id')
      .eq('id', userId)
      .single();

    if (!profile || !profile.house_id) {
      res.status(400).json({ error: 'User does not belong to a house' });
      return;
    }

    const result = await NotificationService.sendToHouse(
      profile.house_id,
      {
        title: '🤫 Anonymous Complaint Raised',
        body: `An anonymous complaint was raised against ${accusedUsername || 'a roommate'}: "${title || category}". Tap to review and vote!`,
        data: {
          type: 'anonymous_complaint_raised',
          logId: String(logId || ''),
        },
      },
      userId
    );

    res.json({ success: true, result });
  } catch (err: any) {
    console.error('Failed to broadcast complaint raised notification:', err);
    res.status(500).json({ error: err.message || 'Failed to broadcast complaint' });
  }
});

// POST /api/notifications/notify-complaint-upheld — Notify house when complaint is upheld and streak penalty applied
router.post('/notify-complaint-upheld', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { logId, accusedUserId, accusedUsername, title, streakPenalty = 10 } = req.body;

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('house_id')
      .eq('id', userId)
      .single();

    if (!profile || !profile.house_id) {
      res.status(400).json({ error: 'User does not belong to a house' });
      return;
    }

    const result = await NotificationService.sendToHouse(
      profile.house_id,
      {
        title: '⚠️ Complaint Upheld: -10 Streaks Penalty!',
        body: `Roommates voted to uphold the complaint against ${accusedUsername || 'roommate'}. -${streakPenalty} streaks penalty applied! 🔥`,
        data: {
          type: 'complaint_upheld',
          logId: String(logId || ''),
          accusedUserId: String(accusedUserId || ''),
        },
      }
    );

    res.json({ success: true, result });
  } catch (err: any) {
    console.error('Failed to notify complaint upheld:', err);
    res.status(500).json({ error: err.message || 'Failed to send complaint upheld notification' });
  }
});

// POST /api/notifications/notify-marketplace-created — Notify housemates when a bounty task goes live
router.post('/notify-marketplace-created', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { taskId, title, bountyXp = 25 } = req.body;

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('house_id, username')
      .eq('id', userId)
      .single();

    if (!profile || !profile.house_id) {
      res.status(400).json({ error: 'User does not belong to a house' });
      return;
    }

    const result = await NotificationService.sendToHouse(
      profile.house_id,
      {
        title: '💰 New Chore Bounty Live!',
        body: `"${title}" is up for grabs for +${bountyXp} XP! Who's claiming it? ⚡`,
        data: {
          type: 'marketplace_created',
          taskId: String(taskId || ''),
        },
      },
      userId
    );

    res.json({ success: true, result });
  } catch (err: any) {
    console.error('Failed to broadcast marketplace creation notification:', err);
    res.status(500).json({ error: err.message || 'Failed to broadcast marketplace chore' });
  }
});

// POST /api/notifications/notify-marketplace-claimed — Notify bounty creator when claimed
router.post('/notify-marketplace-claimed', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { taskId, title, creatorId, bountyXp = 25 } = req.body;

  try {
    const { data: claimer } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single();

    const claimerName = claimer?.username || 'A roommate';

    // If creatorId is known and not the claimer, notify creator directly
    if (creatorId && creatorId !== userId) {
      await NotificationService.sendToUser(creatorId, {
        title: '⚡ Bounty Claimed!',
        body: `${claimerName} claimed your chore "${title}" for +${bountyXp} XP! 🎯`,
        data: {
          type: 'marketplace_claimed',
          taskId: String(taskId || ''),
        },
      });
    }

    res.json({ success: true, message: 'Marketplace claim notification dispatched' });
  } catch (err: any) {
    console.error('Failed to notify marketplace claim:', err);
    res.status(500).json({ error: err.message || 'Failed to send claim notification' });
  }
});

// POST /api/notifications/zomato-nudge — Trigger a witty Zomato-style nudge
router.post('/zomato-nudge', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { houseOnly = true } = req.body;

  try {
    if (houseOnly) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('house_id')
        .eq('id', userId)
        .single();

      if (!profile?.house_id) {
        res.status(400).json({ error: 'User does not belong to a house' });
        return;
      }

      const result = await ZomatoNotificationService.sendNudgeToHouse(profile.house_id);
      res.json({ success: true, result });
    } else {
      const result = await ZomatoNotificationService.broadcastRandomNudgeToAll();
      res.json({ success: true, result });
    }
  } catch (err: any) {
    console.error('Failed to send Zomato-style nudge:', err);
    res.status(500).json({ error: err.message || 'Failed to dispatch Zomato nudge' });
  }
});

// POST /api/notifications/test — Send a test notification to the authenticated user
router.post('/test', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { title = 'RoomieDo Test Notification', body = 'Firebase notifications are working perfectly!' } = req.body;

  try {
    const result = await NotificationService.sendToUser(userId, {
      title,
      body,
      data: { type: 'test', timestamp: new Date().toISOString() },
    });
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to send test notification' });
  }
});

// GET /api/notifications/catchup — Flushes queued notifications & performs Sunday catch-up
router.get('/catchup', async (_req, res: Response): Promise<void> => {
  try {
    const queueResult = await NotificationQueueService.flushQueue();

    const now = new Date();
    let weeklyRan = false;
    // If today is Sunday (0), check and run any unannounced weekly resets
    if (now.getUTCDay() === 0) {
      await WeeklyResetService.checkAndRunAllPendingWeeklyResets();
      weeklyRan = true;
    }

    res.json({
      success: true,
      message: 'Catch-up executed successfully',
      queue: queueResult,
      weeklyResetChecked: weeklyRan,
    });
  } catch (err: any) {
    console.error('Catch-up error:', err);
    res.status(500).json({ error: err.message || 'Failed to execute catch-up' });
  }
});

// POST /api/notifications/sunday-reset — Trigger Sunday calculation (immediate / test)
router.post('/sunday-reset', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { houseId: targetHouseId, force = true } = req.body;

  try {
    let houseId = targetHouseId;
    if (!houseId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('house_id')
        .eq('id', userId)
        .single();
      houseId = profile?.house_id;
    }

    if (!houseId) {
      res.status(400).json({ error: 'houseId could not be determined' });
      return;
    }

    const result = await WeeklyResetService.runWeeklyResetForHouse(houseId, force);
    await NotificationQueueService.flushQueue();

    res.json({
      success: true,
      result,
      message: `Sunday reset completed for house: ${houseId}`,
    });
  } catch (err: any) {
    console.error('Failed to run Sunday reset:', err);
    res.status(500).json({ error: err.message || 'Failed to run Sunday reset' });
  }
});

export default router;
