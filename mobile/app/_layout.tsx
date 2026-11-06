import React, { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { registerForPushNotificationsAsync, setupNotificationListeners } from '../lib/notifications';
import { triggerCatchup } from '../lib/api';

export default function RootLayout() {
  const { session, profile, initialized, setSession, fetchProfile, setInitialized } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  // Notification listeners (foreground reception + tap interaction)
  useEffect(() => {
    const unsubscribe = setupNotificationListeners();
    return () => {
      unsubscribe();
    };
  }, []);

  // Catchup on server sleep / background resumes: flushes queues and triggers Sunday reset
  useEffect(() => {
    triggerCatchup().catch(() => {});

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        triggerCatchup().catch(() => {});
      }
    });

    return () => sub.remove();
  }, []);

  // Register device FCM token whenever a valid user session is active
  useEffect(() => {
    if (session?.user?.id) {
      registerForPushNotificationsAsync();
    }
  }, [session?.user?.id]);

  useEffect(() => {
    // Listen for auth state changes
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession?.user?.id) {
        await fetchProfile(newSession.user.id);
      } else {
        setInitialized(true);
      }
    });

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session: initSession } }) => {
      setSession(initSession);
      if (initSession?.user?.id) {
        await fetchProfile(initSession.user.id);
      } else {
        setInitialized(true);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!initialized) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      if (profile?.house_id) {
        router.replace('/(tabs)');
      } else {
        router.replace('/house/create');
      }
    }
  }, [session, initialized, segments, profile?.house_id]);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="house/create" />
        <Stack.Screen name="house/admin" />
      </Stack>
    </>
  );
}
