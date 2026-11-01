import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '../../store/useAuthStore';
import { COLORS } from '../../constants/theme';

export default function AuthLayout() {
  const { session, profile, initialized } = useAuthStore();

  // Wait until initial session and profile are loaded from Supabase
  if (!initialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Already logged in
  if (session) {
    // Has a house → go to main tabs
    if (profile?.house_id) return <Redirect href="/(tabs)" />;
    // No house yet → go to house setup
    return <Redirect href="/house/create" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  );
}

