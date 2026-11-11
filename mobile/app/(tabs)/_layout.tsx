import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { useFeedStore } from '../../store/useFeedStore';
import { useMarketplaceStore } from '../../store/useMarketplaceStore';
import { COLORS } from '../../constants/theme';

function TabBarIcon({
  name,
  focused,
  color,
  badge,
}: {
  name: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  color?: any;
  badge?: number;
}) {
  return (
    <View style={styles.iconContainer}>
      <Ionicons name={name} size={focused ? 24 : 22} color={color} />
      {typeof badge === 'number' && badge > 0 ? (
        <View style={styles.tabBadgeBubble}>
          <Text style={styles.tabBadgeText}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function TabLayout() {
  const { session, profile, initialized } = useAuthStore();
  const { unreadCounts, fetchAndComputeUnread: fetchFeedUnread } = useFeedStore();
  const { unreadCount: marketplaceUnreadCount, fetchAndComputeUnread: fetchMarketplaceUnread } = useMarketplaceStore();

  useEffect(() => {
    if (!profile?.house_id || !profile?.id) return;

    // Fetch initial unread counts for Feed and Marketplace
    fetchFeedUnread(profile.house_id, profile.id);
    fetchMarketplaceUnread(profile.house_id, profile.id);

    // Realtime listener for Feed (task_logs)
    const feedChannel = supabase
      .channel('tab-layout-feed-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_logs' }, () => {
        if (profile?.house_id && profile?.id) {
          fetchFeedUnread(profile.house_id, profile.id);
        }
      })
      .subscribe();

    // Realtime listener for Marketplace (task_templates)
    const marketChannel = supabase
      .channel('tab-layout-market-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_templates' }, () => {
        if (profile?.house_id && profile?.id) {
          fetchMarketplaceUnread(profile.house_id, profile.id);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(feedChannel);
      supabase.removeChannel(marketChannel);
    };
  }, [profile?.house_id, profile?.id, fetchFeedUnread, fetchMarketplaceUnread]);

  // Wait until auth state is resolved
  if (!initialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/login" />;
  if (!profile?.house_id) return <Redirect href="/house/create" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textLight,
        tabBarStyle: {
          backgroundColor: COLORS.card,
          borderTopColor: COLORS.border,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon name={focused ? 'home' : 'home-outline'} focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon name={focused ? 'checkbox' : 'checkbox-outline'} focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="marketplace"
        options={{
          title: 'Marketplace',
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon
              name={focused ? 'storefront' : 'storefront-outline'}
              focused={focused}
              color={color}
              badge={marketplaceUnreadCount}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon
              name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
              focused={focused}
              color={color}
              badge={unreadCounts.all}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon name={focused ? 'person' : 'person-outline'} focused={focused} color={color} />
          ),
        }}
      />
      {/* Hide legacy leaderboard route from tab bar */}
      <Tabs.Screen
        name="leaderboard"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBadgeBubble: {
    position: 'absolute',
    top: -4,
    right: -7,
    backgroundColor: '#EF4444',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 11,
  },
});
