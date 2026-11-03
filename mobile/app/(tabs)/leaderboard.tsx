import React from 'react';
import { Redirect } from 'expo-router';

// Rankings are now directly embedded on the Home screen.
export default function LeaderboardScreen() {
  return <Redirect href="/(tabs)" />;
}
