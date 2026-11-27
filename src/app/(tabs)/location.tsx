import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Clipboard,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { DarkMapStyle, Palette, Radius, Spacing } from '@/constants/theme';
import { GlassCard } from '@/components/ui/glass-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { TacticalButton } from '@/components/ui/tactical-button';
import {
  getActiveShareId,
  startLiveSharing,
  stopLiveSharing,
  subscribeToConnectionStatus,
  updateLiveLocation,
} from '@/lib/safety-service';

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

type ExtendedCoordinates = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude?: number | null;
  speed?: number | null;
  heading?: number | null;
};

export default function LocationScreen() {
  const router = useRouter();
  const [position, setPosition] = useState<ExtendedCoordinates | null>(null);
  const [tracking, setTracking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [activeShareId, setActiveShareId] = useState<string | null>(null);
  const [sharingLoading, setSharingLoading] = useState(false);

  const subscription = useRef<Location.LocationSubscription | null>(null);
  const activeShareIdRef = useRef<string | null>(null);

  // Monitor online / offline status via Firebase Realtime Database
  useEffect(() => {
    const unsubscribe = subscribeToConnectionStatus((online) => {
      setIsOnline(online);
    });

    // Check if an existing share session is already active
    getActiveShareId().then((id) => {
      setActiveShareId(id);
      activeShareIdRef.current = id;
    });

    return () => {
      unsubscribe();
    };
  }, []);

  async function startTracking() {
    if (loading || tracking) return;

    setLoading(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Location Permission Required',
          'SafeNest requires location access to monitor your safety and capture GPS coordinates.'
        );
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const initial = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        accuracy: current.coords.accuracy,
        altitude: current.coords.altitude,
        speed: current.coords.speed,
        heading: current.coords.heading,
      };

      setPosition(initial);
      setLastUpdated(new Date().toLocaleTimeString());

      if (activeShareIdRef.current) {
        void updateLiveLocation(activeShareIdRef.current, initial);
      }

      const watcher = await Location.watchPositionAsync(
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
            altitude: next.coords.altitude,
            speed: next.coords.speed,
            heading: next.coords.heading,
          };
          setPosition(nextCoords);
          setLastUpdated(new Date().toLocaleTimeString());

          if (activeShareIdRef.current) {
            void updateLiveLocation(activeShareIdRef.current, nextCoords);
          }
        }
      );

      subscription.current?.remove();
      subscription.current = watcher;
      setTracking(true);
    } catch {
      Alert.alert(
        'Location Unavailable',
        'Could not acquire GPS position. Please check that location services (GPS) are toggled ON on your device and try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  function stopTracking() {
    subscription.current?.remove();
    subscription.current = null;
    setTracking(false);
  }

  // Start live location sharing to Firebase with explicit user consent
  function handleStartLiveSharing() {
    if (!position) {
      Alert.alert('Acquiring GPS', 'Start GPS tracking first to get your initial position.');
      return;
    }

    Alert.alert(
      'Consent: Share Live Location?',
      'SafeNest will securely broadcast your real-time GPS coordinates, speed, and accuracy to emergency contacts who receive your link.\n\n• Continuous live streaming while active.\n• You can revoke sharing at any moment.\n\nDo you consent to begin live sharing?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Consent & Share',
          onPress: () => void executeLiveSharing(),
        },
      ]
    );
  }

  async function executeLiveSharing() {
    if (!position) return;
    setSharingLoading(true);
    try {
      const { shareId, cloudSynced } = await startLiveSharing({
        initialCoords: position,
        note: 'Live Journey Sharing',
        durationMinutes: 60,
      });

      setActiveShareId(shareId);
      activeShareIdRef.current = shareId;

      // Auto start tracking if not already streaming
      if (!tracking) {
        void startTracking();
      }

      if (cloudSynced && isOnline) {
        Alert.alert(
          'Live Sharing Active! 🛰️',
          `Your real-time GPS stream is live on the cloud.\nTracking ID: ${shareId}\nEmergency contacts can track you live.`,
          [
            { text: 'OK' },
            {
              text: 'View Track Portal',
              onPress: () => router.push({ pathname: '/track', params: { id: shareId } }),
            },
          ]
        );
      } else {
        Alert.alert(
          'Offline Mode — Session Saved Locally 🟠',
          `You are currently offline. Tracking session ${shareId} is stored locally on this device.\n\nCoordinates will stream to contacts as soon as your internet connection is restored.`,
          [
            { text: 'OK' },
            {
              text: 'View Local Portal',
              onPress: () => router.push({ pathname: '/track', params: { id: shareId } }),
            },
          ]
        );
      }
    } catch {
      Alert.alert('Error', 'Could not initiate live sharing. Operating in local mode.');
    } finally {
      setSharingLoading(false);
    }
  }

  // Stop & Revoke live location sharing
  async function handleStopLiveSharing() {
    if (!activeShareId) return;

    Alert.alert(
      'Revoke Live Location Sharing?',
      'Emergency contacts will no longer be able to see your live position.',
      [
        { text: 'Keep Sharing', style: 'cancel' },
        {
          text: 'Revoke Now',
          style: 'destructive',
          onPress: async () => {
            const idToStop = activeShareId;
            setActiveShareId(null);
            activeShareIdRef.current = null;
            await stopLiveSharing(idToStop, 'revoked');
            Alert.alert('Sharing Revoked', 'Live location link has been securely deactivated.');
          },
        },
      ]
    );
  }

  async function openInMaps() {
    if (!position) {
      Alert.alert('No Position', 'Start GPS tracking first to get your current coordinates.');
      return;
    }

    const geoUrl = `geo:${position.latitude},${position.longitude}?q=${position.latitude},${position.longitude}(SafeNest+Location)`;
    const webUrl = `https://www.google.com/maps/search/?api=1&query=${position.latitude},${position.longitude}`;

    try {
      if (Platform.OS === 'android') {
        const canOpenGeo = await Linking.canOpenURL(geoUrl);
        if (canOpenGeo) {
          await Linking.openURL(geoUrl);
          return;
        }
      }
      await Linking.openURL(webUrl);
    } catch {
      Alert.alert('Unable to open Maps', 'Please verify your internet connection or browser settings.');
    }
  }

  function copyCoordinates() {
    if (!position) {
      Alert.alert('No Position', 'Acquire GPS coordinates first.');
      return;
    }
    const text = `Lat: ${position.latitude.toFixed(6)}, Long: ${position.longitude.toFixed(6)} (±${Math.round(position.accuracy || 10)}m)`;
    Clipboard.setString(text);
    Alert.alert('Copied', 'GPS telemetry coordinates copied to clipboard.');
  }

  async function shareLocation() {
    if (!position) {
      Alert.alert('No Position', 'Start GPS tracking first to capture your location.');
      return;
    }

    const trackLink = activeShareId ? `\nLive Tracker: https://safenest-98008.firebaseapp.com/track?id=${activeShareId}` : '';
    const mapUrl = `https://maps.google.com/?q=${position.latitude},${position.longitude}`;
    const message = `My SafeNest coordinates: Lat ${position.latitude.toFixed(5)}, Long ${position.longitude.toFixed(5)} (±${Math.round(position.accuracy || 10)}m).${trackLink}\nGoogle Maps: ${mapUrl}`;
    const smsUrl = `sms:?body=${encodeURIComponent(message)}`;

    try {
      const canOpen = await Linking.canOpenURL(smsUrl);
      if (canOpen) {
        await Linking.openURL(smsUrl);
      } else {
        Alert.alert('Location Coordinates', message);
      }
    } catch {
      Alert.alert('Location Coordinates', message);
    }
  }

  useEffect(() => {
    return () => {
      subscription.current?.remove();
    };
  }, []);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Navigation & Telemetry Header */}
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
          accessibilityLabel="Back to dashboard"
        >
          <Ionicons name="arrow-back" size={16} color={Palette.textPrimary} />
          <Text style={styles.backBtnText}>Dashboard</Text>
        </TouchableOpacity>

        <View style={styles.statusPillsRow}>
          <StatusBadge
            label={isOnline ? 'CLOUD LINK' : 'LOCAL CACHE'}
            variant={isOnline ? 'teal' : 'warning'}
          />
          <StatusBadge
            label={tracking ? 'GPS ACTIVE' : 'STANDBY'}
            variant={tracking ? 'lime' : 'neutral'}
            pulse={tracking}
          />
        </View>
      </View>

      {/* Editorial Header */}
      <View style={styles.editorialHeader}>
        <Text style={styles.kicker}>SATELLITE POSITIONING</Text>
        <Text style={styles.heading}>Live Mesh Telemetry.</Text>
        <Text style={styles.subheading}>
          Real-time satellite GPS tracking with encrypted bearer stream sharing for emergency safe circles.
        </Text>
      </View>

      {/* Active Live Sharing Status Banner */}
      {activeShareId && (
        <GlassCard variant="active" style={styles.activeShareCard}>
          <View style={styles.activeShareHeader}>
            <View style={styles.activeSharePill}>
              <View style={styles.liveDot} />
              <Text style={styles.activeShareTitle}>LIVE SATELLITE STREAM ACTIVE</Text>
            </View>
            <TouchableOpacity onPress={handleStopLiveSharing} style={styles.revokeBtn}>
              <Text style={styles.revokeText}>Revoke Access</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.activeShareSub}>
            Tracking Bearer ID: <Text style={styles.monoText}>{activeShareId}</Text>
          </Text>
          <Text style={styles.activeShareDesc}>
            Anyone with your bearer link can view moving coordinates in real-time on web or mobile.
          </Text>

          <View style={styles.shareActions}>
            <TacticalButton
              label="Open Contact Portal"
              variant="primary"
              icon={<Ionicons name="open-outline" size={16} color="#0A0C10" />}
              onPress={() => router.push({ pathname: '/track', params: { id: activeShareId } })}
              style={styles.shareActionBtn}
            />
            <TacticalButton
              label="Send Link via SMS"
              variant="secondary"
              icon={<Ionicons name="share-social-outline" size={16} color={Palette.textPrimary} />}
              onPress={shareLocation}
              style={styles.shareActionBtn}
            />
          </View>
        </GlassCard>
      )}

      {/* MAP-FIRST HERO SECTION */}
      <View style={styles.mapContainer}>
        {Platform.OS !== 'web' && MapViewComponent && position ? (
          <MapViewComponent
            style={styles.mapView}
            customMapStyle={DarkMapStyle}
            initialRegion={{
              latitude: position.latitude,
              longitude: position.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            region={{
              latitude: position.latitude,
              longitude: position.longitude,
              latitudeDelta: 0.008,
              longitudeDelta: 0.008,
            }}
          >
            {CircleComponent && (
              <CircleComponent
                center={{ latitude: position.latitude, longitude: position.longitude }}
                radius={Math.max(15, position.accuracy || 20)}
                fillColor="rgba(0, 242, 254, 0.15)"
                strokeColor="rgba(0, 242, 254, 0.5)"
                strokeWidth={1.5}
              />
            )}
            {MarkerComponent && (
              <MarkerComponent
                coordinate={{ latitude: position.latitude, longitude: position.longitude }}
                title="Your Position"
                description={`Accuracy: ±${Math.round(position.accuracy || 10)}m`}
              >
                <View style={styles.customPin}>
                  <View style={styles.pinOuterPulse} />
                  <View style={styles.pinInnerCore} />
                </View>
              </MarkerComponent>
            )}
          </MapViewComponent>
        ) : (
          /* Web & Radar Fallback Screen */
          <View style={styles.radarScreen}>
            <View style={styles.radarRing1}>
              <View style={styles.radarRing2}>
                <View style={styles.radarCenterPin}>
                  <Ionicons name="navigate" size={24} color={Palette.accentTeal} />
                </View>
              </View>
            </View>
            <Text style={styles.radarStatus}>
              {tracking ? '🛰️ SATELLITE MESH LOCKED' : 'GPS STANDBY'}
            </Text>
            {position && (
              <Text style={styles.radarCoords}>
                {position.latitude.toFixed(5)}, {position.longitude.toFixed(5)}
              </Text>
            )}
          </View>
        )}

        {/* Floating Map Overlays */}
        <View style={styles.floatingOverlayTop}>
          <View style={styles.overlayPill}>
            <Ionicons name="radio" size={12} color={tracking ? Palette.accentLime : Palette.textMuted} />
            <Text style={styles.overlayPillText}>
              {tracking ? 'REFRESHING: 4S' : 'GNSS READY'}
            </Text>
          </View>
          {lastUpdated && (
            <View style={styles.overlayPill}>
              <Text style={styles.overlayPillText}>PING: {lastUpdated}</Text>
            </View>
          )}
        </View>

        <View style={styles.floatingOverlayBottom}>
          <TouchableOpacity style={styles.mapActionIcon} onPress={openInMaps}>
            <Ionicons name="map" size={16} color={Palette.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.mapActionIcon} onPress={copyCoordinates}>
            <Ionicons name="copy-outline" size={16} color={Palette.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main GPS Toggle Controls */}
      <View style={styles.controlsRow}>
        <TacticalButton
          label={tracking ? 'Stop GPS Tracking' : 'Start Live GPS Tracking'}
          variant={tracking ? 'secondary' : 'primary'}
          icon={<Ionicons name={tracking ? 'pause' : 'play'} size={16} color={tracking ? Palette.textPrimary : '#0A0C10'} />}
          onPress={tracking ? stopTracking : startTracking}
          loading={loading}
          style={styles.primaryControlBtn}
        />
        <TacticalButton
          label={activeShareId ? 'Manage Stream' : 'Share Live Stream'}
          variant="glass"
          icon={<Ionicons name="cloud-upload-outline" size={16} color={Palette.accentTeal} />}
          onPress={handleStartLiveSharing}
          loading={sharingLoading}
          style={styles.secondaryControlBtn}
        />
      </View>

      {/* High-Precision Telemetry Readout Deck */}
      <View style={styles.telemetryGridHeader}>
        <Text style={styles.gridSectionTitle}>GNSS TELEMETRY CHIPS</Text>
        <Text style={styles.gridSectionMeta}>{position ? 'CALIBRATED' : 'WAITING'}</Text>
      </View>

      <View style={styles.telemetryGrid}>
        <GlassCard style={styles.telemetryCard}>
          <Text style={styles.chipLabel}>LATITUDE</Text>
          <Text style={styles.chipValue}>{position ? position.latitude.toFixed(6) : '—'}</Text>
        </GlassCard>

        <GlassCard style={styles.telemetryCard}>
          <Text style={styles.chipLabel}>LONGITUDE</Text>
          <Text style={styles.chipValue}>{position ? position.longitude.toFixed(6) : '—'}</Text>
        </GlassCard>

        <GlassCard style={styles.telemetryCard}>
          <Text style={styles.chipLabel}>ACCURACY</Text>
          <Text style={[styles.chipValue, { color: Palette.accentTeal }]}>
            {position?.accuracy ? `±${Math.round(position.accuracy)}m` : 'Balanced'}
          </Text>
        </GlassCard>

        <GlassCard style={styles.telemetryCard}>
          <Text style={styles.chipLabel}>VELOCITY / SPEED</Text>
          <Text style={styles.chipValue}>
            {position?.speed && position.speed > 0
              ? `${(position.speed * 3.6).toFixed(1)} km/h`
              : 'Stationary'}
          </Text>
        </GlassCard>
      </View>

      {/* Quick Action Matrix */}
      <View style={styles.actionPillRow}>
        <TouchableOpacity style={styles.pillAction} onPress={openInMaps}>
          <Ionicons name="open-outline" size={15} color={Palette.accentLime} />
          <Text style={styles.pillActionText}>Open Google Maps</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.pillAction} onPress={copyCoordinates}>
          <Ionicons name="copy-outline" size={15} color={Palette.accentTeal} />
          <Text style={styles.pillActionText}>Copy Coordinates</Text>
        </TouchableOpacity>
      </View>
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
  statusPillsRow: {
    flexDirection: 'row',
    gap: 6,
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

  // Active Share Banner
  activeShareCard: {
    marginBottom: Spacing.four,
  },
  activeShareHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  activeSharePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Palette.accentTeal,
  },
  activeShareTitle: {
    color: Palette.accentTeal,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  revokeBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
    backgroundColor: Palette.accentCoralSoft,
  },
  revokeText: {
    color: Palette.accentCoral,
    fontSize: 11,
    fontWeight: '700',
  },
  activeShareSub: {
    color: Palette.textSecondary,
    fontSize: 12,
    marginBottom: 4,
  },
  monoText: {
    color: Palette.textPrimary,
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
  },
  activeShareDesc: {
    color: Palette.textMuted,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: Spacing.three,
  },
  shareActions: {
    flexDirection: 'row',
    gap: 10,
  },
  shareActionBtn: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 10,
  },

  // MAP-FIRST CONTAINER
  mapContainer: {
    width: '100%',
    height: 310,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Palette.borderGlass,
    backgroundColor: Palette.bgSecondary,
    marginBottom: Spacing.four,
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
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 242, 254, 0.3)',
    position: 'absolute',
  },
  pinInnerCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Palette.accentTeal,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  // Radar Fallback Screen
  radarScreen: {
    flex: 1,
    backgroundColor: Palette.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarRing1: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarRing2: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 242, 254, 0.05)',
  },
  radarCenterPin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Palette.accentTealSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarStatus: {
    color: Palette.accentTeal,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: Spacing.three,
  },
  radarCoords: {
    color: Palette.textMuted,
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
    marginTop: 4,
  },

  // Overlays
  floatingOverlayTop: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  overlayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(10, 12, 16, 0.82)',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Palette.borderSubtle,
  },
  overlayPillText: {
    color: Palette.textPrimary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  floatingOverlayBottom: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    gap: 8,
  },
  mapActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(10, 12, 16, 0.88)',
    borderWidth: 1,
    borderColor: Palette.borderGlass,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Controls Row
  controlsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: Spacing.four,
  },
  primaryControlBtn: {
    flex: 1.3,
  },
  secondaryControlBtn: {
    flex: 1,
  },

  // Telemetry Grid
  telemetryGridHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  gridSectionTitle: {
    color: Palette.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  gridSectionMeta: {
    color: Palette.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  telemetryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: Spacing.four,
  },
  telemetryCard: {
    width: '48.5%',
    padding: Spacing.three,
  },
  chipLabel: {
    color: Palette.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  chipValue: {
    color: Palette.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
  },

  // Action Pills
  actionPillRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: Spacing.four,
  },
  pillAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Palette.bgCard,
    borderWidth: 1,
    borderColor: Palette.borderSubtle,
  },
  pillActionText: {
    color: Palette.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
});
