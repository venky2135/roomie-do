import { messaging } from '../firebase';
import { supabase } from '../supabaseClient';

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export class NotificationService {
  /**
   * Register or refresh a device FCM token for a user.
   */
  static async registerToken(userId: string, token: string, deviceType: string = 'android'): Promise<void> {
    if (!token) return;

    const { error } = await supabase
      .from('user_device_tokens')
      .upsert(
        {
          user_id: userId,
          token,
          device_type: deviceType,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'token' }
      );

    if (error) {
      console.error('[NotificationService] Error registering token:', error);
      throw error;
    }
  }

  /**
   * Unregister an FCM token (e.g., on logout).
   */
  static async unregisterToken(userId: string, token: string): Promise<void> {
    if (!token) return;

    const { error } = await supabase
      .from('user_device_tokens')
      .delete()
      .match({ user_id: userId, token });

    if (error) {
      console.error('[NotificationService] Error unregistering token:', error);
      throw error;
    }
  }

  /**
   * Send push notification to a specific user across all their registered devices.
   */
  static async sendToUser(userId: string, payload: NotificationPayload): Promise<{ successCount: number; failureCount: number }> {
    if (!messaging) {
      console.warn('[NotificationService] Firebase messaging not initialized.');
      return { successCount: 0, failureCount: 0 };
    }

    const { data: tokenRecords, error } = await supabase
      .from('user_device_tokens')
      .select('token')
      .eq('user_id', userId);

    if (error || !tokenRecords || tokenRecords.length === 0) {
      return { successCount: 0, failureCount: 0 };
    }

    const tokens = tokenRecords.map((r) => r.token);
    return this.sendToTokens(tokens, payload);
  }

  /**
   * Send push notification to all members of a house (optionally excluding the sender/actor).
   */
  static async sendToHouse(
    houseId: string,
    payload: NotificationPayload,
    excludeUserId?: string
  ): Promise<{ successCount: number; failureCount: number }> {
    if (!messaging) {
      console.warn('[NotificationService] Firebase messaging not initialized.');
      return { successCount: 0, failureCount: 0 };
    }

    // 1. Get all user IDs in the house
    let query = supabase.from('profiles').select('id').eq('house_id', houseId);
    if (excludeUserId) {
      query = query.neq('id', excludeUserId);
    }

    const { data: members, error: membersError } = await query;
    if (membersError || !members || members.length === 0) {
      return { successCount: 0, failureCount: 0 };
    }

    const userIds = members.map((m) => m.id);

    // 2. Get tokens for all these users
    const { data: tokenRecords, error: tokensError } = await supabase
      .from('user_device_tokens')
      .select('token')
      .in('user_id', userIds);

    if (tokensError || !tokenRecords || tokenRecords.length === 0) {
      return { successCount: 0, failureCount: 0 };
    }

    const tokens = tokenRecords.map((r) => r.token);
    return this.sendToTokens(tokens, payload);
  }

  /**
   * Internal helper to send multicast notification and prune dead/unregistered tokens.
   */
  private static async sendToTokens(
    tokens: string[],
    payload: NotificationPayload
  ): Promise<{ successCount: number; failureCount: number }> {
    if (!messaging || tokens.length === 0) {
      return { successCount: 0, failureCount: 0 };
    }

    try {
      const response = await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data || {},
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'roomiedo_general',
          },
        },
      });

      // Prune inactive or dead tokens
      if (response.failureCount > 0) {
        const deadTokens: string[] = [];
        response.responses.forEach((resp: any, idx: number) => {
          if (!resp.success) {
            const errorCode = resp.error?.code;
            if (
              errorCode === 'messaging/registration-token-not-registered' ||
              errorCode === 'messaging/invalid-registration-token'
            ) {
              deadTokens.push(tokens[idx]);
            }
          }
        });

        if (deadTokens.length > 0) {
          console.log(`[NotificationService] Pruning ${deadTokens.length} dead FCM token(s)...`);
          await supabase.from('user_device_tokens').delete().in('token', deadTokens);
        }
      }

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (err) {
      console.error('[NotificationService] Failed to send push notification:', err);
      return { successCount: 0, failureCount: tokens.length };
    }
  }
}
