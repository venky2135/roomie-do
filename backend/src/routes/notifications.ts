import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { NotificationService } from '../services/notificationService';

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

export default router;

