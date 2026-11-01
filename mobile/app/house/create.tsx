import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { router, Redirect } from 'expo-router';
import { createHouse, joinHouse } from '../../lib/api';
import { useAuthStore } from '../../store/useAuthStore';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

export default function CreateHouseScreen() {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [houseName, setHouseName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const { session, profile, refreshProfile, initialized } = useAuthStore();

  if (!initialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Not logged in -> go to login
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  // If user already belongs to a house, redirect directly to dashboard
  if (profile?.house_id) {
    return <Redirect href="/(tabs)" />;
  }

  const handleCreate = async () => {
    if (!houseName.trim()) { Alert.alert('Error', 'Enter a house name'); return; }
    setLoading(true);
    try {
      await createHouse(houseName.trim());
      await refreshProfile();
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error ?? 'Failed to create house');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) { Alert.alert('Error', 'Enter an invite code'); return; }
    setLoading(true);
    try {
      await joinHouse(inviteCode.trim().toUpperCase());
      await refreshProfile();
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error ?? 'Invalid invite code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.emoji}>🏡</Text>
        <Text style={styles.title}>Your House</Text>
        <Text style={styles.sub}>Create a new house or join an existing one.</Text>

        {/* Toggle */}
        <View style={styles.toggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'create' && styles.toggleActive]}
            onPress={() => setMode('create')}
          >
            <Text style={[styles.toggleText, mode === 'create' && styles.toggleTextActive]}>Create House</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'join' && styles.toggleActive]}
            onPress={() => setMode('join')}
          >
            <Text style={[styles.toggleText, mode === 'join' && styles.toggleTextActive]}>Join House</Text>
          </TouchableOpacity>
        </View>

        {mode === 'create' ? (
          <>
            <Text style={styles.label}>House Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Flat 4B"
              placeholderTextColor={COLORS.textLight}
              value={houseName}
              onChangeText={setHouseName}
            />
            <Text style={styles.hint}>You'll be the admin. Default task templates will be added automatically.</Text>
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleCreate}
              disabled={loading}
            >
              <Text style={styles.buttonText}>{loading ? 'Creating...' : '🏡 Create House'}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.label}>Invite Code</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="e.g. XK3T9F"
              placeholderTextColor={COLORS.textLight}
              value={inviteCode}
              onChangeText={setInviteCode}
              autoCapitalize="characters"
              maxLength={6}
            />
            <Text style={styles.hint}>Ask your house admin for the 6-character invite code.</Text>
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleJoin}
              disabled={loading}
            >
              <Text style={styles.buttonText}>{loading ? 'Joining...' : '🚪 Join House'}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flexGrow: 1, padding: SPACING.xl, justifyContent: 'center' },
  emoji: { fontSize: 64, textAlign: 'center' },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginTop: SPACING.sm },
  sub: { color: COLORS.textSecondary, textAlign: 'center', marginBottom: SPACING.lg, marginTop: 4 },
  toggle: { flexDirection: 'row', backgroundColor: COLORS.border, borderRadius: RADIUS.md, padding: 3, marginBottom: SPACING.lg },
  toggleBtn: { flex: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.sm - 2, alignItems: 'center' },
  toggleActive: { backgroundColor: COLORS.card, elevation: 2 },
  toggleText: { fontWeight: '600', color: COLORS.textSecondary },
  toggleTextActive: { color: COLORS.primary },
  label: { fontWeight: '600', color: COLORS.textSecondary, marginBottom: 4 },
  input: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 4,
    fontSize: FONTS.sizes.base, color: COLORS.text,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm,
  },
  codeInput: { letterSpacing: 6, fontSize: FONTS.sizes.xl, textAlign: 'center', fontWeight: '800' },
  hint: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, marginBottom: SPACING.lg },
  button: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
    paddingVertical: SPACING.md, alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFF', fontWeight: '700', fontSize: FONTS.sizes.md },
});

