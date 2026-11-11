import { supabase } from '../supabaseClient';
import { NotificationService } from './notificationService';

export interface EnqueueNotificationParams {
  houseId?: string;
  userId?: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  scheduledFor?: Date;
}

export class NotificationQueueService {
  /**
   * Enqueue a notification to the database.
   * If scheduled for right now, it will attempt an immediate flush.
   */
  static async enqueue(params: EnqueueNotificationParams): Promise<string | null> {
    const scheduledFor = params.scheduledFor ? params.scheduledFor.toISOString() : new Date().toISOString();

    const { data, error } = await supabase
      .from('notification_queue')
      .insert({
        house_id: params.houseId || null,
        user_id: params.userId || null,
        title: params.title,
        body: params.body,
        data: params.data || {},
        status: 'pending',
        scheduled_for: scheduledFor,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[NotificationQueue] Error enqueuing notification:', error);
      // Fallback: try sending directly if queue insert fails (e.g. table not yet migrated)
      if (params.userId) {
        await NotificationService.sendToUser(params.userId, {
          title: params.title,
          body: params.body,
          data: params.data,
        }).catch(() => {});
      } else if (params.houseId) {
        await NotificationService.sendToHouse(params.houseId, {
          title: params.title,
          body: params.body,
          data: params.data,
        }).catch(() => {});
      }
      return null;
    }

    // If scheduled for now, trigger immediate flush asynchronously
    const isNow = !params.scheduledFor || params.scheduledFor.getTime() <= Date.now() + 1000;
    if (isNow) {
      this.flushQueue().catch((err) => {
        console.warn('[NotificationQueue] Immediate flush error:', err);
      });
    }

    return data?.id || null;
  }

  /**
   * Flush any pending notifications that are due to be sent.
   * Called on server startup, periodic cron, and whenever a client wakes the server.
   */
  static async flushQueue(): Promise<{ processed: number; sent: number; failed: number }> {
    const nowIso = new Date().toISOString();

    const { data: pending, error } = await supabase
      .from('notification_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', nowIso)
      .order('scheduled_for', { ascending: true })
      .limit(50);

    if (error) {
      // Table might not exist yet if user hasn't run the migration
      return { processed: 0, sent: 0, failed: 0 };
    }

    if (!pending || pending.length === 0) {
      return { processed: 0, sent: 0, failed: 0 };
    }

    console.log(`[NotificationQueue] Processing ${pending.length} pending notification(s)...`);

    let sentCount = 0;
    let failedCount = 0;

    for (const item of pending) {
      try {
        let result = { successCount: 0, failureCount: 0 };

        if (item.user_id) {
          result = await NotificationService.sendToUser(item.user_id, {
            title: item.title,
            body: item.body,
            data: item.data || {},
          });
        } else if (item.house_id) {
          const excludeUserId = (item.data as any)?.excludeUserId || undefined;
          result = await NotificationService.sendToHouse(
            item.house_id,
            {
              title: item.title,
              body: item.body,
              data: item.data || {},
            },
            excludeUserId
          );
        }

        // Mark as sent
        await supabase
          .from('notification_queue')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            attempts: (item.attempts || 0) + 1,
          })
          .eq('id', item.id);

        sentCount++;
      } catch (sendErr: any) {
        console.error(`[NotificationQueue] Failed delivering item ${item.id}:`, sendErr);
        const attempts = (item.attempts || 0) + 1;
        const newStatus = attempts >= 3 ? 'failed' : 'pending';

        await supabase
          .from('notification_queue')
          .update({
            status: newStatus,
            attempts,
            error_message: sendErr?.message || 'Delivery error',
          })
          .eq('id', item.id);

        failedCount++;
      }
    }

    console.log(`[NotificationQueue] Flush complete: ${sentCount} sent, ${failedCount} failed.`);
    return { processed: pending.length, sent: sentCount, failed: failedCount };
  }
}

