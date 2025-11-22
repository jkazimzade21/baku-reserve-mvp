import React, { useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

import { colors, radius, spacing, shadow } from '../config/theme';
import Surface from '../components/Surface';
import InfoBanner from '../components/InfoBanner';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [pushNotifications, setPushNotifications] = useState(true);
  const [autoAddCalendar, setAutoAddCalendar] = useState(true);
  const { profile, logout, isAuthenticated } = useAuth();
  const derivedName = profile?.name && profile.name !== profile.email ? profile.name : undefined;
  const displayName = derivedName ?? 'Guest profile';
  const displayEmail = profile?.email ?? 'auth@bakureserve.com';
  const handleSignIn = () => navigation.navigate('Auth');

  const contactSupport = () => {
    Linking.openURL('mailto:support@bakureserve.az?subject=Support%20request');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.heroSection}>
          <LinearGradient
            colors={[`${colors.accent}33`, 'transparent']}
            style={styles.heroGradient}
            pointerEvents="none"
          />
          <View style={styles.heroHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{displayName.slice(0, 2).toUpperCase()}</Text>
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroName}>{displayName}</Text>
              <Text style={styles.heroMeta}>{displayEmail}</Text>
              <Text style={styles.heroSubtitle}>
                Manage preferences, notifications, and concierge access for faster bookings.
              </Text>
            </View>
          </View>
          <View style={styles.heroActions}>
            <Pressable style={styles.heroActionButton} onPress={contactSupport}>
              <Feather name="headphones" size={16} color={colors.primaryStrong} />
              <Text style={styles.heroActionText}>Message concierge</Text>
            </Pressable>
            <Pressable style={styles.heroActionButton} onPress={() => setAutoAddCalendar(true)}>
              <Feather name="calendar" size={16} color={colors.primaryStrong} />
              <Text style={styles.heroActionText}>Sync calendar</Text>
            </Pressable>
          </View>
        </View>

        <InfoBanner
          tone="info"
          icon="star"
          title="Member perks"
          message="Enable push updates to get instant alerts when high-demand tables release."
        />

        <Surface tone="overlay" padding="lg" style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          {isAuthenticated ? (
            <>
              <View style={styles.accountRow}>
                <View>
                  <Text style={styles.accountName}>{displayName}</Text>
                  <Text style={styles.accountEmail}>{displayEmail}</Text>
                </View>
                <Pressable style={styles.logoutButton} onPress={logout}>
                  <Text style={styles.logoutButtonText}>Log out</Text>
                </Pressable>
              </View>
              <Text style={styles.accountHint}>
                Authentication is powered by Auth0. Manage your credentials via the Auth0 login portal.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.accountEmail}>Sign in to manage reservations and preferences.</Text>
              <Pressable style={styles.authCta} onPress={handleSignIn}>
                <Text style={styles.authCtaText}>Sign in</Text>
              </Pressable>
            </>
          )}
        </Surface>

        <Surface tone="overlay" padding="lg" style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Push updates</Text>
              <Text style={styles.rowSubtitle}>Seat releases, reminders, and concierge messages.</Text>
            </View>
            <Switch
              value={pushNotifications}
              onValueChange={setPushNotifications}
              thumbColor={pushNotifications ? colors.primaryStrong : '#fff'}
              trackColor={{ false: colors.secondary, true: 'rgba(201,120,69,0.4)' }}
            />
          </View>
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Add to calendar</Text>
              <Text style={styles.rowSubtitle}>Automatically save confirmed reservations to your calendar.</Text>
            </View>
            <Switch
              value={autoAddCalendar}
              onValueChange={setAutoAddCalendar}
              thumbColor={autoAddCalendar ? colors.primaryStrong : '#fff'}
              trackColor={{ false: colors.secondary, true: 'rgba(201,120,69,0.4)' }}
            />
          </View>
        </Surface>


        <Surface tone="overlay" padding="lg" style={styles.section}>
          <Text style={styles.sectionTitle}>Concierge & support</Text>
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Priority concierge</Text>
              <Text style={styles.rowSubtitle}>
                Need a rare table? Reply to any confirmation email and our team will call within 10 minutes.
              </Text>
            </View>
            <Feather name="message-circle" size={18} color={colors.primaryStrong} />
          </View>
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Chat with support</Text>
              <Text style={styles.rowSubtitle}>We answer daily from 10:00 – 02:00 (including weekends).</Text>
            </View>
            <Feather name="mail" size={18} color={colors.primaryStrong} onPress={contactSupport} />
          </View>
        </Surface>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  heroSection: {
    position: 'relative',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  heroName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  heroMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  heroSubtitle: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  heroActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroActionText: {
    fontWeight: '600',
    color: colors.primaryStrong,
  },
  section: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: colors.surface,
    ...shadow.subtle,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  accountEmail: {
    color: colors.muted,
    fontSize: 13,
  },
  accountHint: {
    color: colors.muted,
    fontSize: 12,
  },
  logoutButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primaryStrong,
  },
  logoutButtonText: {
    color: colors.primaryStrong,
    fontWeight: '600',
  },
  authCta: {
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primaryStrong,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  authCtaText: {
    color: colors.primaryStrong,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontWeight: '600',
    color: colors.text,
  },
  rowSubtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
});
