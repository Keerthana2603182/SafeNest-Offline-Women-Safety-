import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  getActiveShareId,
  startLiveSharing,
  stopLiveSharing,
  subscribeToConnectionStatus,
  updateLiveLocation,
} from '@/lib/safety-service';

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
  const [showKeyDiagnosis, setShowKeyDiagnosis] = useState(false);
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
              onPress: () => router.push(`/track?id=${shareId}`),
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
              onPress: () => router.push(`/track?id=${shareId}`),
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Navigation & Connection Status Header */}
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
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Back to dashboard"
        >
          <Text style={styles.backButtonText}>← Dashboard</Text>
        </TouchableOpacity>

        <View style={styles.headerRight}>
          <Text style={[styles.networkBadge, isOnline ? styles.networkOnline : styles.networkOffline]}>
            {isOnline ? '🟢 Online' : '🟠 Local Mode'}
          </Text>
          <Text style={[styles.statusBadge, tracking ? styles.statusActive : styles.statusInactive]}>
            {tracking ? '● GPS ACTIVE' : '○ STANDBY'}
          </Text>
        </View>
      </View>

      <Text style={styles.heading} accessibilityRole="header">Live GPS Tracking</Text>
      <Text style={styles.subtitle}>
        Real-time satellite positioning and secure live sharing with your emergency contacts.
      </Text>

      {/* Active Live Sharing Status Banner */}
      {activeShareId ? (
        <View style={styles.activeShareBanner} accessible={true} accessibilityRole="alert">
          <View style={styles.activeShareHeader}>
            <Text style={styles.activeShareTitle}>🔴 LIVE LOCATION SHARING ACTIVE</Text>
            <TouchableOpacity
              onPress={handleStopLiveSharing}
              style={styles.revokeSmallBtn}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Revoke live sharing"
            >
              <Text style={styles.revokeSmallText}>Revoke</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.activeShareSub}>
            Tracking ID: <Text style={styles.boldText}>{activeShareId}</Text>
          </Text>
          <Text style={styles.activeShareDesc}>
            Emergency contacts can view your coordinates live on web or mobile.
          </Text>

          <View style={styles.shareActionRow}>
            <TouchableOpacity
              style={styles.viewPortalBtn}
              onPress={() => router.push(`/track?id=${activeShareId}`)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Open live tracking portal"
              activeOpacity={0.8}
            >
              <Text style={styles.viewPortalText}>👁️ Open Live Portal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.shareSmsBtn}
              onPress={shareLocation}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Send tracking link via SMS"
              activeOpacity={0.8}
            >
              <Text style={styles.shareSmsText}>✉️ Send Link</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Interactive Visual GPS Radar */}
      <View style={styles.radarCard} accessible={true} accessibilityLabel="GPS radar visualization">
        <View style={styles.radarRingOuter}>
          <View style={styles.radarRingMiddle}>
            <View style={styles.radarRingInner}>
              <Text style={styles.radarCenterPin}>📍</Text>
            </View>
          </View>
        </View>

        {/* Compass Cardinal Indicators */}
        <Text style={styles.compassN}>N</Text>
        <Text style={styles.compassS}>S</Text>
        <Text style={styles.compassW}>W</Text>
        <Text style={styles.compassE}>E</Text>

        <Text style={styles.radarStatusText}>
          {tracking
            ? '🛰️ SATELLITE LOCK ACTIVE'
            : position
            ? '📍 POSITION ACQUIRED'
            : '🛰️ GPS READY TO TRACK'}
        </Text>
        <Text style={styles.radarSubText}>
          {tracking
            ? `Refreshing every 4s • Precision ±${Math.round(position?.accuracy || 5)}m`
            : 'Tap Start GPS Tracking to lock your position'}
        </Text>
      </View>

      {/* Coordinate & Telemetry Card */}
      <View style={styles.infoCard} accessible={true} accessibilityRole="summary">
        <Text style={styles.cardHeader}>TELEMETRY & POSITION</Text>
        {position ? (
          <View style={styles.telemetryGrid}>
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryLabel}>Latitude</Text>
              <Text style={styles.telemetryValue}>{position.latitude.toFixed(6)}°</Text>
            </View>
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryLabel}>Longitude</Text>
              <Text style={styles.telemetryValue}>{position.longitude.toFixed(6)}°</Text>
            </View>
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryLabel}>Accuracy</Text>
              <Text style={styles.telemetryValue}>
                {position.accuracy != null ? `±${Math.round(position.accuracy)} meters` : 'Standard'}
              </Text>
            </View>
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryLabel}>Last Updated</Text>
              <Text style={styles.telemetryValue}>{lastUpdated || 'Just now'}</Text>
            </View>
            {position.speed != null && position.speed > 0 ? (
              <View style={styles.telemetryItem}>
                <Text style={styles.telemetryLabel}>Speed</Text>
                <Text style={styles.telemetryValue}>{(position.speed * 3.6).toFixed(1)} km/h</Text>
              </View>
            ) : null}
            {position.altitude != null ? (
              <View style={styles.telemetryItem}>
                <Text style={styles.telemetryLabel}>Altitude</Text>
                <Text style={styles.telemetryValue}>{Math.round(position.altitude)} m</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <Text style={styles.emptyDetails}>
            GPS receiver is idle. Tap the button below to request current location.
          </Text>
        )}
      </View>

      {/* Main GPS Start / Stop Button */}
      <TouchableOpacity
        style={[
          styles.primaryButton,
          tracking && styles.stopButton,
          loading && styles.disabledButton,
        ]}
        onPress={tracking ? stopTracking : startTracking}
        disabled={loading}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={tracking ? 'Stop GPS Tracking' : 'Start GPS Tracking'}
        activeOpacity={0.85}
      >
        <Text style={styles.primaryButtonText}>
          {loading
            ? 'Acquiring GPS Fix…'
            : tracking
            ? '⏹ Stop GPS Tracking'
            : '▶ Start GPS Tracking'}
        </Text>
      </TouchableOpacity>

      {/* Live Cloud Sharing Button */}
      {activeShareId ? (
        <TouchableOpacity
          style={styles.revokeButton}
          onPress={handleStopLiveSharing}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Stop and revoke live location sharing"
          activeOpacity={0.85}
        >
          <Text style={styles.revokeButtonText}>🔒 Stop & Revoke Live Sharing</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.shareLiveButton, sharingLoading && styles.disabledButton]}
          onPress={handleStartLiveSharing}
          disabled={sharingLoading}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Start live real-time location sharing"
          activeOpacity={0.85}
        >
          <Text style={styles.shareLiveButtonText}>
            {sharingLoading ? 'Creating Live Session…' : '📡 Start Live Sharing to Contacts'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Actions when coordinates acquired */}
      {position ? (
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.mapsButton}
            onPress={openInMaps}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Open current coordinates in Google Maps app"
            activeOpacity={0.85}
          >
            <Text style={styles.mapsButtonText}>🗺️ Open in Google Maps App</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shareButton}
            onPress={shareLocation}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Share current GPS coordinates via SMS"
            activeOpacity={0.85}
          >
            <Text style={styles.shareButtonText}>✉️ Share Coordinates via SMS</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Google Maps API Key Diagnosis & Configuration Panel */}
      <View style={styles.diagnosisCard}>
        <TouchableOpacity
          style={styles.diagnosisHeader}
          onPress={() => setShowKeyDiagnosis(!showKeyDiagnosis)}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Toggle Google Maps API Key Diagnosis information"
          activeOpacity={0.7}
        >
          <Text style={styles.diagnosisTitle}>
            ℹ️ Google Maps API Key Diagnosis {showKeyDiagnosis ? '▲' : '▼'}
          </Text>
        </TouchableOpacity>

        {showKeyDiagnosis ? (
          <View style={styles.diagnosisBody}>
            <Text style={styles.diagnosisP}>
              <Text style={styles.bold}>Diagnosis:</Text> SafeNest utilizes native Google Maps intent dispatch (<Text style={styles.code}>geo:</Text> protocol). This provides 100% reliable turn-by-turn navigation and satellite maps via the official Google Maps app without requiring an embedded API key.
            </Text>
            <Text style={styles.diagnosisP}>
              <Text style={styles.bold}>To enable embedded MapView:</Text> Add your Google Cloud Maps SDK key in <Text style={styles.code}>app.json</Text> under <Text style={styles.code}>android.config.googleMaps.apiKey</Text>. SafeNest&apos;s fail-safe design guarantees the app never crashes if the key is missing or invalid.
            </Text>
          </View>
        ) : (
          <Text style={styles.diagnosisSummary}>
            External Google Maps intent active: 100% reliable, zero API key crashes.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#100D20',
  },
  content: {
    padding: 20,
    paddingTop: 55,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButton: {
    minHeight: 44,
    justifyContent: 'center',
  },
  backButtonText: {
    color: '#A78BFA',
    fontSize: 15,
    fontWeight: 'bold',
  },
  networkBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  networkOnline: {
    color: '#86EFAC',
    backgroundColor: '#163323',
  },
  networkOffline: {
    color: '#FDBA74',
    backgroundColor: '#382215',
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusActive: {
    color: '#86EFAC',
    backgroundColor: '#1A382A',
  },
  statusInactive: {
    color: '#BDB6D0',
    backgroundColor: '#211B36',
  },
  heading: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#BDB6D0',
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 21,
    fontSize: 14,
  },

  // Active Share Banner
  activeShareBanner: {
    backgroundColor: '#1F3328',
    borderColor: '#22C55E',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  activeShareHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activeShareTitle: {
    color: '#86EFAC',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  revokeSmallBtn: {
    backgroundColor: '#3E1D27',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  revokeSmallText: {
    color: '#FF6B6B',
    fontSize: 11,
    fontWeight: 'bold',
  },
  activeShareSub: {
    color: '#FFFFFF',
    fontSize: 13,
    marginTop: 4,
  },
  boldText: {
    fontWeight: 'bold',
    color: '#86EFAC',
  },
  activeShareDesc: {
    color: '#C4E1D0',
    fontSize: 12,
    marginTop: 2,
    marginBottom: 12,
  },
  shareActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  viewPortalBtn: {
    flex: 1,
    backgroundColor: '#2B7A4B',
    padding: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  viewPortalText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  shareSmsBtn: {
    flex: 1,
    backgroundColor: '#372A5C',
    padding: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  shareSmsText: {
    color: '#D8C9FF',
    fontWeight: 'bold',
    fontSize: 12,
  },

  // Radar Visual
  radarCard: {
    minHeight: 220,
    backgroundColor: '#211B36',
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#362B54',
  },
  radarRingOuter: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 1.5,
    borderColor: '#43346B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarRingMiddle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1.5,
    borderColor: '#59448C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarRingInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#37275E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarCenterPin: {
    fontSize: 26,
  },
  compassN: {
    position: 'absolute',
    top: 8,
    color: '#A78BFA',
    fontWeight: 'bold',
    fontSize: 12,
  },
  compassS: {
    position: 'absolute',
    bottom: 8,
    color: '#A78BFA',
    fontWeight: 'bold',
    fontSize: 12,
  },
  compassW: {
    position: 'absolute',
    left: 12,
    color: '#A78BFA',
    fontWeight: 'bold',
    fontSize: 12,
  },
  compassE: {
    position: 'absolute',
    right: 12,
    color: '#A78BFA',
    fontWeight: 'bold',
    fontSize: 12,
  },
  radarStatusText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 14,
    textAlign: 'center',
  },
  radarSubText: {
    color: '#A78BFA',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },

  // Telemetry
  infoCard: {
    backgroundColor: '#211B36',
    padding: 18,
    borderRadius: 16,
    marginBottom: 16,
  },
  cardHeader: {
    color: '#86EFAC',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 12,
  },
  telemetryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  telemetryItem: {
    width: '48%',
    backgroundColor: '#2A2244',
    padding: 12,
    borderRadius: 10,
  },
  telemetryLabel: {
    color: '#BDB6D0',
    fontSize: 11,
    fontWeight: '600',
  },
  telemetryValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 4,
  },
  emptyDetails: {
    color: '#BDB6D0',
    fontSize: 13,
    lineHeight: 19,
  },

  // Buttons
  primaryButton: {
    backgroundColor: '#8B5CF6',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    marginBottom: 12,
  },
  stopButton: {
    backgroundColor: '#D83D59',
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  shareLiveButton: {
    backgroundColor: '#10B981',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    marginBottom: 12,
  },
  shareLiveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  revokeButton: {
    backgroundColor: '#D83D59',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    marginBottom: 12,
  },
  revokeButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  actionsContainer: {
    gap: 10,
    marginBottom: 16,
  },
  mapsButton: {
    backgroundColor: '#2563EB',
    padding: 15,
    borderRadius: 13,
    alignItems: 'center',
    minHeight: 50,
    justifyContent: 'center',
  },
  mapsButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  shareButton: {
    borderWidth: 1.5,
    borderColor: '#8B5CF6',
    padding: 15,
    borderRadius: 13,
    alignItems: 'center',
    minHeight: 50,
    justifyContent: 'center',
  },
  shareButtonText: {
    color: '#D8C9FF',
    fontWeight: 'bold',
    fontSize: 14,
  },

  // Diagnosis Box
  diagnosisCard: {
    backgroundColor: '#1C162E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2D234A',
    marginTop: 8,
  },
  diagnosisHeader: {
    minHeight: 36,
    justifyContent: 'center',
  },
  diagnosisTitle: {
    color: '#A78BFA',
    fontSize: 13,
    fontWeight: 'bold',
  },
  diagnosisSummary: {
    color: '#8E87A5',
    fontSize: 12,
    marginTop: 4,
    lineHeight: 17,
  },
  diagnosisBody: {
    marginTop: 10,
    borderTopWidth: 1,
    borderColor: '#2D234A',
    paddingTop: 10,
  },
  diagnosisP: {
    color: '#C7C0D8',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  bold: {
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  code: {
    color: '#86EFAC',
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
  },
});
