import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import { registerDeviceToken, unregisterDeviceToken } from './api';

// Configure foreground notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let cachedDeviceToken: string | null = null;

/**
 * Configure Android notification channels and request permission to obtain FCM token.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('roomiedo_general', {
      name: 'RoomieDo Notifications',
      description: 'Chore updates, roomie nudges, and house announcements',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3B82F6',
      sound: 'default',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[PushNotifications] Push notification permissions were denied.');
      return null;
    }

    try {
      // Get the native FCM/APNs device token
      const tokenData = await Notifications.getDevicePushTokenAsync();
      token = tokenData.data;
      cachedDeviceToken = token;

      // Register token with backend
      if (token) {
        await registerDeviceToken(token, Platform.OS);
        console.log('✅ FCM Device Token registered with backend:', token);
      }
    } catch (error) {
      console.error('[PushNotifications] Error fetching or registering FCM device token:', error);
    }
  } else {
    console.log('[PushNotifications] Running in simulator/emulator; physical device required for guaranteed FCM push.');
  }

  return token;
}

/**
 * Unregister device token with the backend (e.g., during logout).
 */
export async function unregisterPushNotificationsAsync(): Promise<void> {
  try {
    if (cachedDeviceToken) {
      await unregisterDeviceToken(cachedDeviceToken);
      cachedDeviceToken = null;
      console.log('✅ FCM token unregistered from backend.');
    }
  } catch (error) {
    console.error('[PushNotifications] Error unregistering device token:', error);
  }
}

/**
 * Set up listeners for received notifications and notification clicks/deep-links.
 */
export function setupNotificationListeners() {
  // Listener for notifications received while app is foregrounded
  const notificationListener = Notifications.addNotificationReceivedListener((notification) => {
    console.log('📩 Notification received in foreground:', notification.request.content);
  });

  // Listener for when a user interacts with / taps on a notification
  const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    console.log('👆 User tapped notification with data:', data);

    if (data?.type === 'nudge') {
      // Navigate to feed / home screen
      router.push('/(tabs)/feed');
    } else if (data?.type === 'task_pending_verification' || data?.type === 'task_approved') {
      // Navigate to tasks tab
      router.push('/(tabs)/tasks');
    }
  });

  return () => {
    notificationListener.remove();
    responseListener.remove();
  };
}
