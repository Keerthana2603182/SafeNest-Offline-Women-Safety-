import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { DarkMapStyle, Palette, Radius, Spacing } from '@/constants/theme';
import { GlassCard } from '@/components/ui/glass-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { TacticalButton } from '@/components/ui/tactical-button';
import { LiveShareSession, subscribeToLiveLocation } from '@/lib/safety-service';

// Safe platform-aware map loading
let MapViewComponent: any = null;
let MarkerComponent: any = null;
let CircleComponent: any = null;

if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Maps = require('react-native-maps');
    MapViewComponent = Maps.default;
    MarkerComponent = Maps.Marker;
    CircleComponent = Maps.Circle;
  } catch {
    // Quiet fallback
  }
}

export default function LiveTrackingViewerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const initialId = params.id ? String(params.id) : '';
  const [shareIdInput, setShareIdInput] = useState(initialId);
  const [activeShareId, setActiveShareId] = useState(initialId);
  const [session, setSession] = useState<LiveShareSession | null>(null);
  const [loading, setLoading] = useState(Boolean(initialId));
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    const id = activeShareId.trim();
    if (!id) {
      return;
    }

    const unsubscribe = subscribeToLiveLocation(id, (data) => {
      setSession(data);
      setLoading(false);
      setSecondsAgo(0);
    });

    return () => {
      unsubscribe();
    };
  }, [activeShareId]);

  // Seconds ago ticker
  useEffect(() => {
    const interval = setInterval(() => {
      if (session?.updatedAt) {
        const diff = Math.max(0, Math.floor((Date.now() - session.updatedAt) / 1000));
        setSecondsAgo(diff);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [session]);

  function handleSearch() {
    const cleanId = shareIdInput.trim();
    if (!cleanId) {
      Alert.alert('Missing ID', 'Please enter a valid SafeNest tracking session ID.');
      return;
    }
    setSession(null);
    setLoading(true);
    setActiveShareId(cleanId);
  }

  async function openDirections() {
    if (!session) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${session.latitude},${session.longitude}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Maps Unavailable', 'Could not launch map directions.');
    }
  }

  async function callEmergency() {
    const url = 'tel:112';
    try {
      const canCall = await Linking.canOpenURL(url);
      if (canCall) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Emergency Helpline', 'Dial 112 on your device.');
      }
    } catch {
      Alert.alert('Emergency Helpline', 'Dial 112 on your device.');
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Top Nav */}
      <View style={styles.topNav}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/');
            }
          }}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Back to previous screen"
        >
          <Ionicons name="arrow-back" size={16} color={Palette.textPrimary} />
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>

        <StatusBadge
          label={
            session?.status === 'sos'
              ? 'EMERGENCY SOS'
              : session?.status === 'active'
              ? 'STREAM LIVE'
              : session?.status === 'revoked'
              ? 'STREAM REVOKED'
              : 'PORTAL READY'
          }
          variant={session?.status === 'sos' ? 'coral' : session?.status === 'active' ? 'teal' : 'neutral'}
          pulse={session?.status === 'sos' || session?.status === 'active'}
        />
      </View>

      {/* Editorial Header */}
      <View style={styles.editorialHeader}>
        <Text style={styles.kicker}>TELEMETRY STREAM PORTAL</Text>
        <Text style={styles.heading}>Live Contact Tracker.</Text>
        <Text style={styles.subheading}>
          Real-time GPS tracker for emergency safe circles. Coordinates update live across all devices with zero app install required.
        </Text>
      </View>

      {/* Track ID Search Bar */}
      <GlassCard style={styles.searchCard}>
        <Text style={styles.searchLabel}>SAFENEST TRACKING SESSION ID</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="e.g. sn_a1b2c3d4"
            placeholderTextColor={Palette.textMuted}
            value={shareIdInput}
            onChangeText={setShareIdInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TacticalButton
            label="Connect"
            variant="primary"
            icon={<Ionicons name="navigate" size={16} color="#0A0C10" />}
            onPress={handleSearch}
            style={styles.searchBtn}
          />
        </View>
      </GlassCard>

      {/* Main Content Area */}
      {loading ? (
        <GlassCard style={styles.statusBox}>
          <Ionicons name="sync" size={24} color={Palette.accentTeal} />
          <Text style={styles.statusBoxText}>Connecting to satellite live stream…</Text>
        </GlassCard>
      ) : session?.status === 'revoked' ? (
        <GlassCard variant="danger" style={styles.revokedCard}>
          <View style={styles.revokedHeader}>
            <View style={styles.revokedIconOrb}>
              <Ionicons name="lock-closed" size={22} color={Palette.accentCoral} />
            </View>
            <View>
              <Text style={styles.revokedTitle}>Session Access Revoked</Text>
              <Text style={styles.revokedSub}>{session.userName} has ended location sharing.</Text>
            </View>
          </View>

          <View style={styles.revokedDetails}>
            <Text style={styles.revokedDetailText}>• Real-time GPS stream broadcast has been terminated.</Text>
            <Text style={styles.revokedDetailText}>• Coordinate telemetry was purged for privacy security.</Text>
            <Text style={styles.revokedDetailText}>• Session ended: {new Date(session.updatedAt).toLocaleTimeString()}</Text>
          </View>

          <TacticalButton
            label="Return to Safety Dashboard"
            variant="secondary"
            onPress={() => router.replace('/')}
            style={styles.returnBtn}
          />
        </GlassCard>
      ) : session ? (
        <View style={styles.activeSessionSection}>
          {/* Status Alert Banner */}
          <GlassCard
            variant={session.status === 'sos' ? 'danger' : 'active'}
            style={styles.statusBanner}
          >
            <View style={styles.bannerTop}>
              <View style={styles.bannerTitleRow}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: session.status === 'sos' ? Palette.accentCoral : Palette.accentTeal },
                  ]}
                />
                <Text
                  style={[
                    styles.bannerTitle,
                    { color: session.status === 'sos' ? Palette.accentCoral : Palette.accentTeal },
                  ]}
                >
                  {session.status === 'sos' ? '🚨 EMERGENCY SOS ACTIVE' : '🟢 SATELLITE STREAMING'}
                </Text>
              </View>
              <Text style={styles.bannerTicker}>
                {secondsAgo === 0 ? 'Ping: just now' : `Ping: ${secondsAgo}s ago`}
              </Text>
            </View>
            <Text style={styles.bannerUser}>
              Broadcaster: <Text style={styles.bannerUserBold}>{session.userName}</Text>
            </Text>
          </GlassCard>

          {/* Map View */}
          <View style={styles.mapContainer}>
            {Platform.OS !== 'web' && MapViewComponent ? (
              <MapViewComponent
                style={styles.mapView}
                customMapStyle={DarkMapStyle}
                initialRegion={{
                  latitude: session.latitude,
                  longitude: session.longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
                region={{
                  latitude: session.latitude,
                  longitude: session.longitude,
                  latitudeDelta: 0.008,
                  longitudeDelta: 0.008,
                }}
              >
                {CircleComponent && (
                  <CircleComponent
                    center={{ latitude: session.latitude, longitude: session.longitude }}
                    radius={Math.max(20, session.accuracy || 25)}
                    fillColor={
                      session.status === 'sos'
                        ? 'rgba(255, 59, 48, 0.2)'
                        : 'rgba(0, 242, 254, 0.15)'
                    }
                    strokeColor={
                      session.status === 'sos'
                        ? Palette.accentCoral
                        : Palette.accentTeal
                    }
                    strokeWidth={1.5}
                  />
                )}
                {MarkerComponent && (
                  <MarkerComponent
                    coordinate={{ latitude: session.latitude, longitude: session.longitude }}
                    title={session.userName}
                    description={`Accuracy: ±${Math.round(session.accuracy || 10)}m`}
                  >
                    <View style={styles.customPin}>
                      <View
                        style={[
                          styles.pinOuterPulse,
                          {
                            backgroundColor:
                              session.status === 'sos'
                                ? 'rgba(255, 59, 48, 0.4)'
                                : 'rgba(0, 242, 254, 0.4)',
                          },
                        ]}
                      />
                      <View
                        style={[
                          styles.pinInnerCore,
                          {
                            backgroundColor:
                              session.status === 'sos'
                                ? Palette.accentCoral
                                : Palette.accentTeal,
                          },
                        ]}
                      />
                    </View>
                  </MarkerComponent>
                )}
              </MapViewComponent>
            ) : (
              /* Radar Web Fallback */
              <View style={styles.radarFallback}>
                <Ionicons
                  name={session.status === 'sos' ? 'warning' : 'navigate'}
                  size={36}
                  color={session.status === 'sos' ? Palette.accentCoral : Palette.accentTeal}
                />
                <Text style={styles.radarCoordsText}>
                  {session.latitude.toFixed(5)}, {session.longitude.toFixed(5)}
                </Text>
                <Text style={styles.radarAccuracy}>
                  Accuracy: ±{Math.round(session.accuracy || 10)}m
                </Text>
              </View>
            )}

            {/* Floating Live Telemetry Badge */}
            <View style={styles.floatingCoordPill}>
              <Ionicons name="location" size={13} color={Palette.accentLime} />
              <Text style={styles.floatingCoordText}>
                {session.latitude.toFixed(5)}, {session.longitude.toFixed(5)}
              </Text>
            </View>
          </View>

          {/* Quick Action Buttons */}
          <View style={styles.sessionActions}>
            <TacticalButton
              label="Get Directions in Maps"
              variant="primary"
              icon={<Ionicons name="navigate-outline" size={16} color="#0A0C10" />}
              onPress={openDirections}
              style={styles.sessionActionBtn}
            />
            <TacticalButton
              label="Call 112 Helpline"
              variant="coral"
              icon={<Ionicons name="call" size={16} color="#FFFFFF" />}
              onPress={callEmergency}
              style={styles.sessionActionBtn}
            />
          </View>
        </View>
      ) : (
        /* Empty Prompt */
        <GlassCard style={styles.promptCard}>
          <View style={styles.promptIconOrb}>
            <Ionicons name="globe-outline" size={32} color={Palette.accentTeal} />
          </View>
          <Text style={styles.promptTitle}>Enter a SafeNest Tracking ID</Text>
          <Text style={styles.promptDesc}>
            Enter or paste a valid session identifier above to monitor real-time satellite coordinates dispatched by your emergency contact.
          </Text>
        </GlassCard>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.bgPrimary,
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
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    backgroundColor: Palette.bgElevated,
    borderWidth: 1,
    borderColor: Palette.borderSubtle,
  },
  backBtnText: {
    color: Palette.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  editorialHeader: {
    marginBottom: Spacing.four,
  },
  kicker: {
    color: Palette.accentTeal,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  heading: {
    color: Palette.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subheading: {
    color: Palette.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  searchCard: {
    marginBottom: Spacing.four,
  },
  searchLabel: {
    color: Palette.accentTeal,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: Spacing.two,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    backgroundColor: Palette.bgSecondary,
    color: Palette.textPrimary,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Palette.borderSubtle,
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
  },
  searchBtn: {
    minWidth: 110,
    minHeight: 46,
  },
  statusBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.five,
    gap: 10,
  },
  statusBoxText: {
    color: Palette.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  revokedCard: {
    padding: Spacing.four,
  },
  revokedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: Spacing.three,
  },
  revokedIconOrb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Palette.accentCoralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revokedTitle: {
    color: Palette.accentCoral,
    fontSize: 16,
    fontWeight: '800',
  },
  revokedSub: {
    color: Palette.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  revokedDetails: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: Radius.md,
    padding: Spacing.three,
    gap: 6,
    marginBottom: Spacing.four,
  },
  revokedDetailText: {
    color: Palette.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  returnBtn: {
    width: '100%',
  },
  activeSessionSection: {
    gap: 12,
  },
  statusBanner: {
    padding: Spacing.three,
  },
  bannerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  bannerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  bannerTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  bannerTicker: {
    color: Palette.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  bannerUser: {
    color: Palette.textSecondary,
    fontSize: 13,
  },
  bannerUserBold: {
    color: Palette.textPrimary,
    fontWeight: '700',
  },
  mapContainer: {
    width: '100%',
    height: 320,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Palette.borderGlass,
    backgroundColor: Palette.bgSecondary,
    position: 'relative',
  },
  mapView: {
    width: '100%',
    height: '100%',
  },
  customPin: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinOuterPulse: {
    width: 26,
    height: 26,
    borderRadius: 13,
    position: 'absolute',
  },
  pinInnerCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  radarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  radarCoordsText: {
    color: Palette.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
  },
  radarAccuracy: {
    color: Palette.textMuted,
    fontSize: 12,
  },
  floatingCoordPill: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(10, 12, 16, 0.88)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Palette.borderGlass,
  },
  floatingCoordText: {
    color: Palette.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
  },
  sessionActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  sessionActionBtn: {
    flex: 1,
    minHeight: 46,
  },
  promptCard: {
    alignItems: 'center',
    padding: Spacing.five,
    marginTop: Spacing.two,
  },
  promptIconOrb: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Palette.accentTealSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  promptTitle: {
    color: Palette.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  promptDesc: {
    color: Palette.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
});
