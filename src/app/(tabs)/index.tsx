import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Clipboard,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';

import { Palette, Radius, Spacing } from '@/constants/theme';
import { GlassCard } from '@/components/ui/glass-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { TacticalButton } from '@/components/ui/tactical-button';
import { OnboardingModal } from '@/components/ui/onboarding-modal';
import {
  startLiveSharing,
  stopLiveSharing,
  subscribeToConnectionStatus,
  updateLiveLocation,
} from '@/lib/safety-service';

type TrustedContact = {
  id: string;
  name: string;
  phone: string;
};

const STORAGE_KEY = 'safenest_trusted_contacts';
const COUNTDOWN_SECONDS = 5;

const EMERGENCY_SERVICES = [
  { name: 'National Emergency', number: '112', icon: 'shield-alert', desc: 'Central Dispatch & Police' },
  { name: 'Police Direct', number: '100', icon: 'car-sport', desc: 'Immediate Law Enforcement' },
  { name: 'Women Helpline', number: '1091', icon: 'people', desc: '24/7 Dedicated Women Security' },
  { name: 'Ambulance & Trauma', number: '108', icon: 'medkit', desc: 'Medical Emergency Unit' },
];

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ trigger?: string }>();

  // SOS State
  const [countingDown, setCountingDown] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [sosActive, setSosActive] = useState(false);
  const [sosLocation, setSosLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number | null;
  } | null>(null);
  const [sosShareId, setSosShareId] = useState<string | null>(null);
  const [sosCloudSynced, setSosCloudSynced] = useState(false);
  const [sosTimestamp, setSosTimestamp] = useState<string | null>(null);
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [emergencyModalVisible, setEmergencyModalVisible] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationWatcherRef = useRef<Location.LocationSubscription | null>(null);
  const sosShareIdRef = useRef<string | null>(null);

  // Monitor online / offline connection status
  useEffect(() => {
    const unsubscribe = subscribeToConnectionStatus((online) => {
      setIsOnline(online);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Shortcut / Voice trigger support (e.g. safenest://?trigger=sos)
  useEffect(() => {
    if (params.trigger === 'sos' && !sosActive && !countingDown) {
      handleStartSOS();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.trigger]);

  // Load contacts from SecureStore
  useEffect(() => {
    async function loadContacts() {
      try {
        const saved = await SecureStore.getItemAsync(STORAGE_KEY);
        if (saved) {
          setContacts(JSON.parse(saved) as TrustedContact[]);
        }
      } catch {
        // Quiet fallback
      }
    }
    loadContacts();
  }, []);

  // Cleanup timers and watchers on unmount
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      locationWatcherRef.current?.remove();
    };
  }, []);

  function triggerVibration(pattern: number | number[]) {
    if (Platform.OS !== 'web') {
      try {
        Vibration.vibrate(pattern);
      } catch {
        // Fallback
      }
    }
  }

  // Start SOS Countdown
  function handleStartSOS() {
    setCountdown(COUNTDOWN_SECONDS);
    setCountingDown(true);
    triggerVibration([0, 400, 200, 400]);

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    let remaining = COUNTDOWN_SECONDS;
    countdownIntervalRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      triggerVibration(150);

      if (remaining <= 0) {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        setCountingDown(false);
        void activateSOS();
      }
    }, 1000);
  }

  // Cancel SOS during countdown
  function handleCancelSOS() {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountingDown(false);
    setCountdown(COUNTDOWN_SECONDS);
    triggerVibration(100);

    Alert.alert(
      'SOS Alert Cancelled',
      'The emergency countdown was stopped. No alerts were dispatched. You are safe.',
      [{ text: 'OK' }]
    );
  }

  // Immediate Trigger without waiting
  function handleImmediateTrigger() {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountingDown(false);
    void activateSOS();
  }

  // Activate SOS
  async function activateSOS() {
    setSosActive(true);
    setSosTimestamp(new Date().toLocaleTimeString());
    triggerVibration([0, 500, 200, 500, 200, 500]);

    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (permission.granted) {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const initialCoords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setSosLocation(initialCoords);

        // Push real-time SOS session to Firebase Realtime Database
        try {
          const { shareId, cloudSynced } = await startLiveSharing({
            initialCoords,
            isSOS: true,
            note: 'EMERGENCY SOS DISPATCHED',
            durationMinutes: 120,
          });
          setSosShareId(shareId);
          setSosCloudSynced(cloudSynced);
          sosShareIdRef.current = shareId;
        } catch {
          setSosCloudSynced(false);
        }

        // Live stream updates to Firebase as long as SOS is active
        locationWatcherRef.current?.remove();
        locationWatcherRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 4000,
            distanceInterval: 4,
          },
          (next) => {
            const nextCoords = {
              latitude: next.coords.latitude,
              longitude: next.coords.longitude,
              accuracy: next.coords.accuracy,
            };
            setSosLocation(nextCoords);
            if (sosShareIdRef.current) {
              void updateLiveLocation(sosShareIdRef.current, nextCoords);
            }
          }
        );
      }
    } catch {
      // Handled quietly
    }

    // Refresh contacts from storage
    try {
      const saved = await SecureStore.getItemAsync(STORAGE_KEY);
      if (saved) {
        setContacts(JSON.parse(saved) as TrustedContact[]);
      }
    } catch {
      // Fallback
    }
  }

  // Deactivate SOS
  function handleDeactivateSOS() {
    Alert.alert(
      'Deactivate Emergency SOS?',
      'Are you sure you want to deactivate the emergency alert?',
      [
        { text: 'Keep Active', style: 'cancel' },
        {
          text: 'I Am Safe (Deactivate)',
          style: 'destructive',
          onPress: async () => {
            locationWatcherRef.current?.remove();
            locationWatcherRef.current = null;

            if (sosShareIdRef.current) {
              await stopLiveSharing(sosShareIdRef.current, 'resolved');
              sosShareIdRef.current = null;
              setSosShareId(null);
            }

            setSosActive(false);
            setSosLocation(null);
            setSosTimestamp(null);
            triggerVibration(200);
            Alert.alert('SOS Deactivated', 'SafeNest has returned to ready state.');
          },
        },
      ]
    );
  }

  // Call Emergency Number
  async function callNumber(phone: string) {
    const url = `tel:` + phone;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Calling Unavailable', 'Cannot place calls directly on this device: ' + phone);
      }
    } catch {
      Alert.alert('Error', 'Could not initiate call to ' + phone);
    }
  }

  // Share Coordinates via SMS/Messaging
  async function shareCoordinates() {
    if (!sosLocation) {
      Alert.alert('Location Pending', 'Location is still being acquired. Please try in a moment.');
      return;
    }

    const liveLink = sosShareId ? '\nLive Tracking Stream: https://safenest-98008.firebaseapp.com/track?id=' + sosShareId : '';
    const mapUrl = 'https://maps.google.com/?q=' + sosLocation.latitude + ',' + sosLocation.longitude;
    const message = 'EMERGENCY (SafeNest SOS): I need help. My current location is: Lat ' + sosLocation.latitude.toFixed(5) + ', Long ' + sosLocation.longitude.toFixed(5) + '.' + liveLink + '\nGoogle Maps: ' + mapUrl;
    const smsUrl = 'sms:?body=' + encodeURIComponent(message);

    try {
      const canOpen = await Linking.canOpenURL(smsUrl);
      if (canOpen) {
        await Linking.openURL(smsUrl);
      } else {
        Alert.alert('Simulated Alert Message', message);
      }
    } catch {
      Alert.alert('Simulated Alert Message', message);
    }
  }

  function copyTrackingLink() {
    if (sosShareId) {
      const url = 'https://safenest-98008.firebaseapp.com/track?id=' + sosShareId;
      Clipboard.setString(url);
      Alert.alert('Link Copied', 'Live satellite tracking URL copied to clipboard.');
    }
  }

  return (
    <View style={styles.root}>
      <OnboardingModal />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Top Navigation & Telemetry Bar */}
        <View style={styles.topNav}>
          <View style={styles.brandGroup}>
            <View style={styles.brandIconOrb}>
              <Ionicons name="shield" size={16} color={Palette.accentLime} />
            </View>
            <Text style={styles.brandTitle}>SAFENEST</Text>
          </View>

          <View style={styles.topActions}>
            <StatusBadge
              label={isOnline ? 'SATELLITE ACTIVE' : 'LOCAL CACHE'}
              variant={isOnline ? 'teal' : 'warning'}
              pulse={isOnline}
            />
            <TouchableOpacity
              style={styles.hotlineQuickBtn}
              onPress={() => setEmergencyModalVisible(true)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Emergency directory hotlines"
            >
              <Ionicons name="call" size={16} color={Palette.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Editorial Title Section */}
        <View style={styles.editorialHeader}>
          <Text style={styles.kicker}>COMMAND CONSOLE</Text>
          <Text style={styles.heroTitle}>
            {sosActive ? 'Emergency Protocol\nEngaged.' : 'Autonomous\nPersonal Safety.'}
          </Text>
          <Text style={styles.heroSubtitle}>
            {sosActive
              ? 'Telemetry broadcast active since ' + (sosTimestamp ?? 'now') + '. Safe circle notified.'
              : 'Safe circle vigilant • 5s rapid dispatch ready.'}
          </Text>
        </View>

        {/* Active Emergency SOS Banner (when triggered) */}
        {sosActive && (
          <GlassCard variant="danger" style={styles.sosActiveCard}>
            <View style={styles.sosCardHeader}>
              <View style={styles.sosPulseBadge}>
                <View style={styles.pulseDot} />
                <Text style={styles.sosCardTitle}>ACTIVE EMERGENCY BROADCAST</Text>
              </View>
              <StatusBadge
                label={sosCloudSynced ? 'CLOUD SYNCED' : 'LOCAL ONLY'}
                variant={sosCloudSynced ? 'lime' : 'warning'}
              />
            </View>

            {sosShareId && (
              <View style={styles.sessionLinkBox}>
                <View style={styles.sessionLinkMeta}>
                  <Text style={styles.sessionLinkLabel}>BEARER STREAM ID</Text>
                  <Text style={styles.sessionIdText}>{sosShareId}</Text>
                </View>
                <View style={styles.sessionLinkButtons}>
                  <TouchableOpacity style={styles.miniBtn} onPress={copyTrackingLink}>
                    <Ionicons name="copy-outline" size={14} color={Palette.textPrimary} />
                    <Text style={styles.miniBtnText}>Copy Link</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.miniBtn, styles.miniBtnPrimary]}
                    onPress={() => router.push({ pathname: '/track', params: { id: sosShareId } })}
                  >
                    <Ionicons name="open-outline" size={14} color={Palette.accentLime} />
                    <Text style={[styles.miniBtnText, { color: Palette.accentLime }]}>Open Portal</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {sosLocation ? (
              <View style={styles.telemetryStrip}>
                <Ionicons name="navigate-circle" size={18} color={Palette.accentTeal} />
                <Text style={styles.telemetryText}>
                  Lat {sosLocation.latitude.toFixed(5)}, Long {sosLocation.longitude.toFixed(5)} (±{Math.round(sosLocation.accuracy || 10)}m)
                </Text>
              </View>
            ) : (
              <Text style={styles.acquiringText}>📍 Acquiring high-precision GPS lock...</Text>
            )}

            {/* Dispatched Circle Checklist */}
            <View style={styles.dispatchChecklist}>
              <Text style={styles.dispatchTitle}>DISPATCHED SAFE CIRCLE</Text>
              {contacts.length > 0 ? (
                contacts.map((c) => (
                  <View key={c.id} style={styles.contactDispatchItem}>
                    <Ionicons name="checkmark-circle" size={16} color={Palette.accentLime} />
                    <Text style={styles.contactDispatchName}>{c.name}</Text>
                    <Text style={styles.contactDispatchPhone}>{c.phone}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.noContactsWarning}>
                  ⚠️ No trusted contacts added yet. Tap Safe Circle below to register contacts.
                </Text>
              )}
            </View>

            {/* Emergency Action Buttons */}
            <View style={styles.sosActionRow}>
              <TacticalButton
                label="Call 112"
                variant="coral"
                icon={<Ionicons name="call" size={16} color="#FFFFFF" />}
                onPress={() => callNumber('112')}
                style={styles.sosActionBtn}
              />
              <TacticalButton
                label="Send SMS"
                variant="secondary"
                icon={<Ionicons name="chatbubble-ellipses" size={16} color={Palette.textPrimary} />}
                onPress={shareCoordinates}
                style={styles.sosActionBtn}
              />
            </View>

            <TacticalButton
              label="I AM SAFE — DEACTIVATE SOS"
              variant="secondary"
              icon={<Ionicons name="shield-checkmark" size={16} color={Palette.accentLime} />}
              onPress={handleDeactivateSOS}
              style={styles.deactivateBtn}
            />
          </GlassCard>
        )}

        {/* Tactile SOS Trigger Hub */}
        <View style={styles.sosHubSection}>
          <View style={[styles.radarOuterRing, sosActive && styles.radarOuterRingActive]}>
            <View style={[styles.radarMidRing, sosActive && styles.radarMidRingActive]}>
              <TouchableOpacity
                style={[styles.sosButtonCore, sosActive && styles.sosButtonCoreActive]}
                onPress={sosActive ? handleDeactivateSOS : handleStartSOS}
                activeOpacity={0.88}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={sosActive ? 'Stop Emergency SOS' : 'Trigger Emergency SOS'}
                accessibilityHint="Starts 5 second emergency countdown with cancellation window"
              >
                <Ionicons
                  name={sosActive ? 'stop-circle' : 'shield-sharp'}
                  size={38}
                  color={sosActive ? '#FFFFFF' : Palette.accentCoral}
                />
                <Text style={[styles.sosButtonLabel, sosActive && styles.sosButtonLabelActive]}>
                  {sosActive ? 'DEACTIVATE' : 'SOS'}
                </Text>
                <Text style={styles.sosSubLabel}>
                  {sosActive ? 'TAP WHEN SAFE' : '5S DISPATCH'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.sosInstruction}>
            {sosActive
              ? 'Telemetry streaming live to cloud and emergency contacts.'
              : 'Tap to initiate instant 5s dispatch countdown with safe cancel window.'}
          </Text>
        </View>

        {/* Live Safety Deck (Quick Telemetry Widgets) */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeading}>DEFENSE SENTINELS</Text>
          <Text style={styles.sectionMeta}>REAL-TIME</Text>
        </View>

        <View style={styles.deckRow}>
          {/* Live GPS Telemetry Widget */}
          <GlassCard style={styles.deckWidget}>
            <TouchableOpacity onPress={() => router.push('/location')} activeOpacity={0.85}>
              <View style={styles.widgetTop}>
                <View style={[styles.widgetIconOrb, { backgroundColor: Palette.accentTealSoft }]}>
                  <Ionicons name="navigate" size={18} color={Palette.accentTeal} />
                </View>
                <StatusBadge label="LIVE" variant="teal" />
              </View>
              <Text style={styles.widgetTitle}>Satellite GPS</Text>
              <Text style={styles.widgetDesc}>High-precision telemetry & bearer sharing</Text>
              <View style={styles.widgetFooter}>
                <Text style={styles.widgetActionText}>View Live Map</Text>
                <Ionicons name="arrow-forward" size={14} color={Palette.accentTeal} />
              </View>
            </TouchableOpacity>
          </GlassCard>

          {/* Safe Arrival Timer Widget */}
          <GlassCard style={styles.deckWidget}>
            <TouchableOpacity onPress={() => router.push('/timer')} activeOpacity={0.85}>
              <View style={styles.widgetTop}>
                <View style={[styles.widgetIconOrb, { backgroundColor: Palette.accentLimeSoft }]}>
                  <Ionicons name="timer" size={18} color={Palette.accentLime} />
                </View>
                <StatusBadge label="READY" variant="lime" />
              </View>
              <Text style={styles.widgetTitle}>Arrival Watch</Text>
              <Text style={styles.widgetDesc}>Autonomous overdue escalation sentinel</Text>
              <View style={styles.widgetFooter}>
                <Text style={[styles.widgetActionText, { color: Palette.accentLime }]}>Configure</Text>
                <Ionicons name="arrow-forward" size={14} color={Palette.accentLime} />
              </View>
            </TouchableOpacity>
          </GlassCard>
        </View>

        {/* Command Matrix Grid */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeading}>SECURITY SERVICES</Text>
          <Text style={styles.sectionMeta}>{contacts.length} IN CIRCLE</Text>
        </View>

        <View style={styles.matrixGrid}>
          {/* Safe Circle / Contacts */}
          <GlassCard style={styles.matrixCard}>
            <TouchableOpacity onPress={() => router.push('/contacts')} activeOpacity={0.85}>
              <View style={styles.matrixCardTop}>
                <Ionicons name="people" size={24} color={Palette.accentLime} />
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{contacts.length}</Text>
                </View>
              </View>
              <Text style={styles.matrixTitle}>Safe Circle</Text>
              <Text style={styles.matrixSubtitle}>
                {contacts.length > 0 ? contacts.length + ' trusted members receiving SMS' : 'No contacts configured'}
              </Text>
            </TouchableOpacity>
          </GlassCard>

          {/* Live Tracker Portal */}
          <GlassCard style={styles.matrixCard}>
            <TouchableOpacity onPress={() => router.push('/track')} activeOpacity={0.85}>
              <View style={styles.matrixCardTop}>
                <Ionicons name="globe-outline" size={24} color={Palette.accentTeal} />
                <Ionicons name="chevron-forward" size={16} color={Palette.textMuted} />
              </View>
              <Text style={styles.matrixTitle}>Live Tracker</Text>
              <Text style={styles.matrixSubtitle}>Browser-viewable telemetry stream portal</Text>
            </TouchableOpacity>
          </GlassCard>

          {/* Emergency Directory Full Width */}
          <GlassCard style={[styles.matrixCard, styles.matrixCardFull]}>
            <TouchableOpacity
              onPress={() => setEmergencyModalVisible(true)}
              activeOpacity={0.85}
              style={styles.hotlinesRow}
            >
              <View style={styles.hotlineLeft}>
                <View style={[styles.widgetIconOrb, { backgroundColor: Palette.accentCoralSoft }]}>
                  <Ionicons name="flash" size={20} color={Palette.accentCoral} />
                </View>
                <View>
                  <Text style={styles.matrixTitle}>Direct Emergency Hotlines</Text>
                  <Text style={styles.matrixSubtitle}>1-touch direct dial to 112, Police (100), Ambulance (108)</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Palette.textSecondary} />
            </TouchableOpacity>
          </GlassCard>
        </View>

        {/* Editorial Footer */}
        <View style={styles.footerBrand}>
          <Text style={styles.footerText}>SAFENEST SECURITY PLATFORM</Text>
          <Text style={styles.footerSub}>Autonomous protection without boundaries</Text>
        </View>
      </ScrollView>

      {/* 5-Second Rapid Countdown Modal */}
      <Modal visible={countingDown} transparent={true} animationType="fade" onRequestClose={handleCancelSOS}>
        <View style={styles.countdownBackdrop}>
          <View style={styles.countdownCard}>
            <View style={styles.countdownBadge}>
              <Text style={styles.countdownBadgeText}>EMERGENCY PROTOCOL ENGAGED</Text>
            </View>

            <Text style={styles.countdownHeadline}>Dispatching Alert In</Text>

            <View style={styles.countdownRing}>
              <Text style={styles.countdownNumber}>{countdown}</Text>
              <Text style={styles.countdownUnit}>SECONDS</Text>
            </View>

            <Text style={styles.countdownWarn}>
              If you triggered this by accident or are completely safe, cancel immediately.
            </Text>

            <TacticalButton
              label="✕ CANCEL — I AM SAFE"
              variant="secondary"
              onPress={handleCancelSOS}
              style={styles.cancelCountdownBtn}
            />

            <TacticalButton
              label="⚡ DISPATCH NOW WITHOUT WAITING"
              variant="coral"
              onPress={handleImmediateTrigger}
              style={styles.immediateCountdownBtn}
            />
          </View>
        </View>
      </Modal>

      {/* Emergency Hotlines Modal */}
      <Modal
        visible={emergencyModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setEmergencyModalVisible(false)}
      >
        <View style={styles.hotlineModalBackdrop}>
          <View style={styles.hotlineModalSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Emergency Hotlines</Text>
              <TouchableOpacity onPress={() => setEmergencyModalVisible(false)} style={styles.sheetCloseBtn}>
                <Ionicons name="close" size={20} color={Palette.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.sheetDesc}>
              Direct cellular telephone connection. Works even when data connectivity is degraded.
            </Text>

            <View style={styles.hotlineList}>
              {EMERGENCY_SERVICES.map((svc) => (
                <TouchableOpacity
                  key={svc.number}
                  style={styles.hotlineItem}
                  onPress={() => callNumber(svc.number)}
                  activeOpacity={0.8}
                >
                  <View style={styles.hotlineItemLeft}>
                    <View style={styles.hotlineItemIconOrb}>
                      <Ionicons name={svc.icon as any} size={20} color={Palette.accentLime} />
                    </View>
                    <View>
                      <Text style={styles.hotlineItemName}>{svc.name}</Text>
                      <Text style={styles.hotlineItemDesc}>{svc.desc}</Text>
                    </View>
                  </View>
                  <View style={styles.hotlineDialPill}>
                    <Ionicons name="call" size={13} color="#0A0C10" />
                    <Text style={styles.hotlineDialText}>{svc.number}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <TacticalButton
              label="Close Directory"
              variant="secondary"
              onPress={() => setEmergencyModalVisible(false)}
              style={styles.sheetDoneBtn}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.bgPrimary,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Platform.select({ ios: 60, android: 45 }) ?? 45,
    paddingBottom: 110,
  },
  topNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.four,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandIconOrb: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Palette.accentLimeSoft,
    borderWidth: 1,
    borderColor: 'rgba(212, 255, 58, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    color: Palette.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 2.2,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hotlineQuickBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Palette.bgElevated,
    borderWidth: 1,
    borderColor: Palette.borderGlass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorialHeader: {
    marginBottom: Spacing.four,
  },
  kicker: {
    color: Palette.accentLime,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  heroTitle: {
    color: Palette.textPrimary,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  heroSubtitle: {
    color: Palette.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },

  // Active Emergency SOS Card
  sosActiveCard: {
    marginBottom: Spacing.four,
  },
  sosCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  sosPulseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Palette.accentCoral,
  },
  sosCardTitle: {
    color: Palette.accentCoral,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  sosTimestamp: {
    color: Palette.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  sessionLinkBox: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: Radius.md,
    padding: Spacing.two,
    marginBottom: Spacing.two,
  },
  sessionLinkMeta: {
    marginBottom: 8,
  },
  sessionLinkLabel: {
    color: Palette.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  sessionIdText: {
    color: Palette.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
    marginTop: 2,
  },
  sessionLinkButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  miniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    backgroundColor: Palette.bgElevated,
  },
  miniBtnPrimary: {
    backgroundColor: 'rgba(212, 255, 58, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(212, 255, 58, 0.3)',
  },
  miniBtnText: {
    color: Palette.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  telemetryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.two,
  },
  telemetryText: {
    color: Palette.accentTeal,
    fontSize: 12,
    fontWeight: '600',
  },
  acquiringText: {
    color: Palette.textMuted,
    fontSize: 12,
    marginBottom: Spacing.two,
  },
  dispatchChecklist: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: Radius.md,
    padding: Spacing.two,
    marginBottom: Spacing.three,
  },
  dispatchTitle: {
    color: Palette.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  contactDispatchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
  },
  contactDispatchName: {
    color: Palette.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  contactDispatchPhone: {
    color: Palette.textMuted,
    fontSize: 12,
  },
  noContactsWarning: {
    color: '#FBBF24',
    fontSize: 12,
    lineHeight: 18,
  },
  sosActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  sosActionBtn: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 10,
  },
  deactivateBtn: {
    minHeight: 44,
    paddingVertical: 10,
  },

  // Tactile SOS Trigger Core
  sosHubSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing.four,
  },
  radarOuterRing: {
    width: 210,
    height: 210,
    borderRadius: 105,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: 'rgba(255, 255, 255, 0.015)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarOuterRingActive: {
    borderColor: Palette.borderCoral,
    backgroundColor: 'rgba(255, 59, 48, 0.08)',
  },
  radarMidRing: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: Palette.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarMidRingActive: {
    borderColor: Palette.accentCoral,
  },
  sosButtonCore: {
    width: 136,
    height: 136,
    borderRadius: 68,
    backgroundColor: Palette.bgElevated,
    borderWidth: 2,
    borderColor: 'rgba(255, 59, 48, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Palette.accentCoral,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  sosButtonCoreActive: {
    backgroundColor: Palette.accentCoral,
    borderColor: '#FFFFFF',
    shadowOpacity: 0.5,
  },
  sosButtonLabel: {
    color: Palette.accentCoral,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 2,
  },
  sosButtonLabelActive: {
    color: '#FFFFFF',
  },
  sosSubLabel: {
    color: Palette.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 2,
  },
  sosInstruction: {
    color: Palette.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: Spacing.two,
    maxWidth: 280,
    lineHeight: 18,
  },

  // Deck Row
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
  sectionHeading: {
    color: Palette.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  sectionMeta: {
    color: Palette.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  deckRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: Spacing.two,
  },
  deckWidget: {
    flex: 1,
    padding: Spacing.three,
  },
  widgetTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  widgetIconOrb: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  widgetTitle: {
    color: Palette.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  widgetDesc: {
    color: Palette.textMuted,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: Spacing.two,
    minHeight: 32,
  },
  widgetFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  widgetActionText: {
    color: Palette.accentTeal,
    fontSize: 12,
    fontWeight: '700',
  },

  // Matrix Grid
  matrixGrid: {
    gap: 12,
  },
  matrixCard: {
    padding: Spacing.three,
  },
  matrixCardFull: {
    width: '100%',
  },
  matrixCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  countBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: Radius.full,
    backgroundColor: Palette.accentLimeSoft,
    borderWidth: 1,
    borderColor: 'rgba(212, 255, 58, 0.3)',
  },
  countBadgeText: {
    color: Palette.accentLime,
    fontSize: 11,
    fontWeight: '800',
  },
  matrixTitle: {
    color: Palette.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  matrixSubtitle: {
    color: Palette.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  hotlinesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hotlineLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },

  // Footer Brand
  footerBrand: {
    alignItems: 'center',
    marginTop: Spacing.six,
    marginBottom: Spacing.four,
  },
  footerText: {
    color: Palette.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  footerSub: {
    color: 'rgba(255, 255, 255, 0.25)',
    fontSize: 11,
    marginTop: 4,
  },

  // Countdown Modal
  countdownBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 10, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  countdownCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Palette.bgCard,
    borderRadius: Radius.xl,
    padding: Spacing.four,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Palette.borderCoral,
  },
  countdownBadge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    backgroundColor: Palette.accentCoralSoft,
    borderWidth: 1,
    borderColor: Palette.borderCoral,
    marginBottom: Spacing.three,
  },
  countdownBadgeText: {
    color: Palette.accentCoral,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  countdownHeadline: {
    color: Palette.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: Spacing.three,
  },
  countdownRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: Palette.accentCoral,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    marginBottom: Spacing.three,
  },
  countdownNumber: {
    color: Palette.textPrimary,
    fontSize: 54,
    fontWeight: '900',
    lineHeight: 60,
  },
  countdownUnit: {
    color: Palette.accentCoral,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  countdownWarn: {
    color: Palette.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.four,
  },
  cancelCountdownBtn: {
    width: '100%',
    marginBottom: 10,
  },
  immediateCountdownBtn: {
    width: '100%',
  },

  // Hotlines Sheet Modal
  hotlineModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 10, 0.75)',
    justifyContent: 'flex-end',
  },
  hotlineModalSheet: {
    backgroundColor: Palette.bgElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.four,
    borderWidth: 1,
    borderColor: Palette.borderGlass,
    paddingBottom: Platform.select({ ios: 40, default: 24 }),
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'center',
    marginBottom: Spacing.three,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sheetTitle: {
    color: Palette.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Palette.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetDesc: {
    color: Palette.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing.four,
  },
  hotlineList: {
    gap: 10,
    marginBottom: Spacing.four,
  },
  hotlineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Palette.bgSurface,
    borderRadius: Radius.md,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Palette.borderSubtle,
  },
  hotlineItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hotlineItemIconOrb: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.accentLimeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hotlineItemName: {
    color: Palette.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  hotlineItemDesc: {
    color: Palette.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  hotlineDialPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Palette.accentLime,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
  },
  hotlineDialText: {
    color: '#0A0C10',
    fontSize: 13,
    fontWeight: '800',
  },
  sheetDoneBtn: {
    width: '100%',
  },
});