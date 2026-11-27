import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User,
} from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';

import { auth } from '@/lib/firebase';
import { GlassCard } from '@/components/ui/glass-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { TacticalButton } from '@/components/ui/tactical-button';
import { Palette, Radius, Spacing } from '@/constants/theme';

export default function AccountScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  // Tactical preferences (persisted locally for the session)
  const [audibleAlarm, setAudibleAlarm] = useState(true);
  const [satelliteFallback, setSatelliteFallback] = useState(true);
  const [autoSmsDispatch, setAutoSmsDispatch] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setChecking(false);
    });

    return unsubscribe;
  }, []);

  async function handleAccount() {
    const cleanEmail = email.trim();
    const cleanPass = password.trim();

    if (!cleanEmail || !cleanPass) {
      Alert.alert('Required Fields', 'Please provide both your email address and password.');
      return;
    }

    if (cleanPass.length < 6) {
      Alert.alert('Password Criteria', 'Master password must be at least 6 characters.');
      return;
    }

    try {
      setLoading(true);
      if (isLogin) {
        await signInWithEmailAndPassword(auth, cleanEmail, cleanPass);
      } else {
        await createUserWithEmailAndPassword(auth, cleanEmail, cleanPass);
      }
      setEmail('');
      setPassword('');
    } catch (error: any) {
      const msg = error.code ? error.code.replace('auth/', '') : error.message || 'Operation failed';
      Alert.alert('Authentication Error', msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth);
      setEmail('');
      setPassword('');
      Alert.alert('Session Terminated', 'You have been disconnected from the cloud vault.');
    } catch {
      Alert.alert('Error', 'Failed to disconnect session.');
    }
  }

  if (checking) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={Palette.accentLime} size="large" />
        <Text style={styles.loadingText}>INITIALIZING VAULT...</Text>
      </View>
    );
  }

  const isAnonymous = user?.isAnonymous ?? false;
  const userIdentifier = user?.email || (isAnonymous ? 'Anonymous Node' : 'Authenticated Sentinel');
  const userInitial = user?.email ? user.email.charAt(0).toUpperCase() : 'S';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboardContainer}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Bar */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/');
              }
            }}
            accessibilityRole="button"
            accessibilityLabel="Back to Command Center"
          >
            <Ionicons name="arrow-back" size={16} color={Palette.accentLime} />
            <Text style={styles.backText}>COMMAND</Text>
          </TouchableOpacity>

          <StatusBadge
            label={user && !isAnonymous ? 'CLOUD VAULT' : 'LOCAL MESH'}
            variant={user && !isAnonymous ? 'lime' : 'teal'}
            pulse={Boolean(user)}
          />
        </View>

        {/* Title & Editorial Subtitle */}
        <View style={styles.titleSection}>
          <Text style={styles.categoryLabel}>CRYPTOGRAPHIC SECURITY</Text>
          <Text style={styles.headline}>Identity & Vault</Text>
          <Text style={styles.subtitle}>
            Manage authenticated cloud synchronization, hardware telemetry relays, and emergency dispatch preferences.
          </Text>
        </View>

        {user && !isAnonymous ? (
          /* ================= Authenticated State ================= */
          <View style={styles.sectionStack}>
            {/* Identity Card */}
            <GlassCard variant="elevated" style={styles.profileCard}>
              <View style={styles.avatarRow}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarInitial}>{userInitial}</Text>
                </View>
                <View style={styles.avatarMeta}>
                  <View style={styles.statusPill}>
                    <View style={styles.greenDot} />
                    <Text style={styles.statusPillText}>AUTHENTICATED SENTINEL</Text>
                  </View>
                  <Text style={styles.userEmail} numberOfLines={1}>{userIdentifier}</Text>
                  <Text style={styles.nodeId}>NODE ID: {user.uid.slice(0, 14)}...</Text>
                </View>
              </View>
            </GlassCard>

            {/* Cloud Telemetry Node Status */}
            <GlassCard variant="default">
              <View style={styles.sectionHeader}>
                <Ionicons name="cloud-done-outline" size={18} color={Palette.accentLime} />
                <Text style={styles.sectionTitle}>CLOUD SYNCHRONIZATION</Text>
              </View>

              <View style={styles.syncRows}>
                <View style={styles.syncRow}>
                  <View style={styles.syncRowLeft}>
                    <Ionicons name="server-outline" size={16} color={Palette.accentTeal} />
                    <Text style={styles.syncLabel}>Realtime Telemetry DB</Text>
                  </View>
                  <StatusBadge label="ONLINE" variant="teal" />
                </View>

                <View style={styles.syncDivider} />

                <View style={styles.syncRow}>
                  <View style={styles.syncRowLeft}>
                    <Ionicons name="people-outline" size={16} color={Palette.accentTeal} />
                    <Text style={styles.syncLabel}>Safe Circle Vault</Text>
                  </View>
                  <StatusBadge label="AES-256 SYNCED" variant="lime" />
                </View>

                <View style={styles.syncDivider} />

                <View style={styles.syncRow}>
                  <View style={styles.syncRowLeft}>
                    <Ionicons name="navigate-outline" size={16} color={Palette.accentTeal} />
                    <Text style={styles.syncLabel}>Live Coordinate Streamer</Text>
                  </View>
                  <StatusBadge label="STANDBY" variant="neutral" />
                </View>
              </View>
            </GlassCard>

            {/* Tactical Emergency Preferences */}
            <GlassCard variant="default">
              <View style={styles.sectionHeader}>
                <Ionicons name="options-outline" size={18} color={Palette.accentLime} />
                <Text style={styles.sectionTitle}>TACTICAL PREFERENCES</Text>
              </View>

              <View style={styles.prefRow}>
                <View style={styles.prefTextGroup}>
                  <Text style={styles.prefTitle}>Audible Countdown Siren</Text>
                  <Text style={styles.prefDesc}>Loud sound during 5s countdown before dispatch</Text>
                </View>
                <Switch
                  value={audibleAlarm}
                  onValueChange={setAudibleAlarm}
                  trackColor={{ false: Palette.bgCard, true: Palette.accentLime }}
                  thumbColor={Palette.textPrimary}
                />
              </View>

              <View style={styles.syncDivider} />

              <View style={styles.prefRow}>
                <View style={styles.prefTextGroup}>
                  <Text style={styles.prefTitle}>Automatic SMS Dispatch</Text>
                  <Text style={styles.prefDesc}>Broadcast live map link to Safe Circle instantly</Text>
                </View>
                <Switch
                  value={autoSmsDispatch}
                  onValueChange={setAutoSmsDispatch}
                  trackColor={{ false: Palette.bgCard, true: Palette.accentLime }}
                  thumbColor={Palette.textPrimary}
                />
              </View>

              <View style={styles.syncDivider} />

              <View style={styles.prefRow}>
                <View style={styles.prefTextGroup}>
                  <Text style={styles.prefTitle}>Satellite Mesh Relay</Text>
                  <Text style={styles.prefDesc}>Queue SOS packets locally when offline</Text>
                </View>
                <Switch
                  value={satelliteFallback}
                  onValueChange={setSatelliteFallback}
                  trackColor={{ false: Palette.bgCard, true: Palette.accentLime }}
                  thumbColor={Palette.textPrimary}
                />
              </View>
            </GlassCard>

            {/* Sign Out Action */}
            <TacticalButton
              label="DISCONNECT SENTINEL SESSION"
              variant="coral"
              icon={<Ionicons name="log-out-outline" size={18} color={Palette.accentCoral} />}
              onPress={handleLogout}
              style={styles.actionButton}
            />
          </View>
        ) : (
          /* ================= Unauthenticated / Login Form ================= */
          <View style={styles.sectionStack}>
            {/* Mode Switcher Tabs */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tabButton, isLogin && styles.tabButtonActive]}
                onPress={() => setIsLogin(true)}
              >
                <Text style={[styles.tabButtonText, isLogin && styles.tabButtonTextActive]}>
                  SIGN IN
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, !isLogin && styles.tabButtonActive]}
                onPress={() => setIsLogin(false)}
              >
                <Text style={[styles.tabButtonText, !isLogin && styles.tabButtonTextActive]}>
                  ENROLL NODE
                </Text>
              </TouchableOpacity>
            </View>

            {/* Credential Form Card */}
            <GlassCard variant="elevated" style={styles.formCard}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>OFFICIAL EMAIL</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="mail-outline" size={18} color={Palette.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="agent@domain.com"
                    placeholderTextColor={Palette.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>MASTER KEY (PASSWORD)</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={18} color={Palette.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Minimum 6 characters"
                    placeholderTextColor={Palette.textMuted}
                    secureTextEntry
                    autoCapitalize="none"
                    value={password}
                    onChangeText={setPassword}
                  />
                </View>
              </View>

              <TacticalButton
                label={isLogin ? 'AUTHENTICATE SESSION' : 'ESTABLISH SECURE VAULT'}
                variant="primary"
                loading={loading}
                icon={<Ionicons name="shield-checkmark-outline" size={18} color={Palette.bgPrimary} />}
                onPress={handleAccount}
                style={styles.submitButton}
              />
            </GlassCard>

            {/* Offline & Anonymous Guarantee */}
            <GlassCard variant="default">
              <View style={styles.noticeHeader}>
                <Ionicons name="shield-outline" size={20} color={Palette.accentTeal} />
                <Text style={styles.noticeTitle}>Zero Knowledge Architecture</Text>
              </View>
              <Text style={styles.noticeBody}>
                SafeNest works immediately without registration. An authenticated account is optional and merely enables continuous encrypted backup of your Safe Circle contacts across multiple devices.
              </Text>
            </GlassCard>
          </View>
        )}

        {/* Security Footer Notice */}
        <View style={styles.footer}>
          <Text style={styles.footerNote}>
            TLS 1.3 ENCRYPTION • CLIENT-SIDE VAULT • MILITARY-GRADE AES-256
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: Palette.bgPrimary,
  },
  container: {
    flex: 1,
    backgroundColor: Palette.bgPrimary,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: 54,
    paddingBottom: Spacing.six,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Palette.bgPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
  },
  loadingText: {
    color: Palette.accentLime,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.four,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    backgroundColor: Palette.bgCard,
    borderWidth: 1,
    borderColor: Palette.borderSubtle,
  },
  backText: {
    color: Palette.accentLime,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  titleSection: {
    marginBottom: Spacing.five,
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Palette.accentLime,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  headline: {
    fontSize: 30,
    fontWeight: '800',
    color: Palette.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: Palette.textSecondary,
    lineHeight: 19,
  },
  sectionStack: {
    gap: Spacing.four,
  },
  profileCard: {
    padding: Spacing.four,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Palette.accentLimeSoft,
    borderWidth: 2,
    borderColor: Palette.accentLime,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 24,
    fontWeight: '800',
    color: Palette.accentLime,
  },
  avatarMeta: {
    flex: 1,
    gap: 3,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Palette.accentLime,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: Palette.accentLime,
    letterSpacing: 0.8,
  },
  userEmail: {
    fontSize: 16,
    fontWeight: '700',
    color: Palette.textPrimary,
  },
  nodeId: {
    fontSize: 11,
    color: Palette.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.three,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Palette.textPrimary,
    letterSpacing: 1.2,
  },
  syncRows: {
    gap: Spacing.two,
  },
  syncRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  syncRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncLabel: {
    fontSize: 13,
    color: Palette.textSecondary,
    fontWeight: '500',
  },
  syncDivider: {
    height: 1,
    backgroundColor: Palette.borderSubtle,
    marginVertical: 4,
  },
  prefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  prefTextGroup: {
    flex: 1,
    paddingRight: Spacing.three,
  },
  prefTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Palette.textPrimary,
    marginBottom: 2,
  },
  prefDesc: {
    fontSize: 11,
    color: Palette.textSecondary,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Palette.bgCard,
    borderRadius: Radius.lg,
    padding: 4,
    borderWidth: 1,
    borderColor: Palette.borderSubtle,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: Radius.md,
  },
  tabButtonActive: {
    backgroundColor: Palette.bgElevated,
    borderWidth: 1,
    borderColor: Palette.borderHighlight,
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: Palette.textSecondary,
    letterSpacing: 0.8,
  },
  tabButtonTextActive: {
    color: Palette.accentLime,
  },
  formCard: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Palette.textSecondary,
    letterSpacing: 1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.bgPrimary,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Palette.borderSubtle,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    color: Palette.textPrimary,
    fontSize: 14,
    paddingVertical: 12,
  },
  submitButton: {
    marginTop: Spacing.two,
  },
  actionButton: {
    marginTop: Spacing.two,
  },
  noticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  noticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Palette.textPrimary,
  },
  noticeBody: {
    fontSize: 12,
    color: Palette.textSecondary,
    lineHeight: 18,
  },
  footer: {
    marginTop: Spacing.six,
    alignItems: 'center',
  },
  footerNote: {
    fontSize: 9,
    fontWeight: '700',
    color: Palette.textMuted,
    letterSpacing: 1.2,
    textAlign: 'center',
  },
});