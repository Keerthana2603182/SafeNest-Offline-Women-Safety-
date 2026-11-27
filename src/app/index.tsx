import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
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
import {
  startLiveSharing,
  stopLiveSharing,
  subscribeToConnectionStatus,
  updateLiveLocation,
} from '../lib/safety-service';

type TrustedContact = {
  id: string;
  name: string;
  phone: string;
};

const STORAGE_KEY = 'safenest_trusted_contacts';
const COUNTDOWN_SECONDS = 5;

const EMERGENCY_SERVICES = [
  { name: 'National Emergency', number: '112', icon: '🚨' },
  { name: 'Police', number: '100', icon: '👮' },
  { name: 'Women Helpline', number: '1091', icon: '🛡️' },
  { name: 'Ambulance', number: '108', icon: '🚑' },
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
        // Ignore on unsupported platforms
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
      'The emergency countdown has been stopped. No alerts were sent. You are safe.',
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
          // Handled in offline mode
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
      // Location retrieval error handled gracefully
    }

    // Refresh contacts from storage
    try {
      const saved = await SecureStore.getItemAsync(STORAGE_KEY);
      if (saved) {
        setContacts(JSON.parse(saved) as TrustedContact[]);
      }
    } catch {
      // Keep existing contacts
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
            Alert.alert('SOS Deactivated', 'SafeNest has returned to normal ready state.');
          },
        },
      ]
    );
  }

  // Call Emergency Number
  async function callNumber(phone: string) {
    const url = `tel:${phone}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Calling Unavailable', `Cannot place calls directly on this device: ${phone}`);
      }
    } catch {
      Alert.alert('Error', `Could not initiate call to ${phone}`);
    }
  }

  // Share Coordinates via SMS/Messaging
  async function shareCoordinates() {
    if (!sosLocation) {
      Alert.alert('Location Pending', 'Location is still being acquired. Please try in a moment.');
      return;
    }

    const liveLink = sosShareId ? `\nLive Tracking Stream: https://safenest-98008.firebaseapp.com/track?id=${sosShareId}` : '';
    const mapUrl = `https://maps.google.com/?q=${sosLocation.latitude},${sosLocation.longitude}`;
    const message = `EMERGENCY (SafeNest SOS): I need help. My current location is: Lat ${sosLocation.latitude.toFixed(5)}, Long ${sosLocation.longitude.toFixed(5)}.${liveLink}\nGoogle Maps: ${mapUrl}`;
    const smsUrl = `sms:?body=${encodeURIComponent(message)}`;

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.logo} accessibilityRole="header">🛡️ SafeNest</Text>
        <View style={styles.headerBadges}>
          <Text style={[styles.networkBadge, isOnline ? styles.networkOnline : styles.networkOffline]}>
            {isOnline ? '🟢 Online' : '🟠 Local Mode'}
          </Text>
          <Text
            style={[styles.status, sosActive && styles.statusActive]}
            accessibilityLabel={sosActive ? 'Status: Emergency SOS Active' : 'Status: Safety Dashboard Ready'}
          >
            {sosActive ? '🚨 SOS ACTIVE' : '● Ready'}
          </Text>
        </View>
      </View>

      <Text style={styles.welcome}>Your safety, our priority.</Text>
      <Text style={styles.subtitle}>
        You deserve to feel safe everywhere.
      </Text>

      {/* SOS Active Emergency Banner */}
      {sosActive ? (
        <View style={styles.sosActiveBanner} accessible={true} accessibilityRole="alert">
          <Text style={styles.sosActiveTitle}>🚨 EMERGENCY SOS TRIGGERED</Text>
          <Text style={styles.sosActiveSubtitle}>
            Emergency alert demonstration active since {sosTimestamp}
          </Text>

          {/* Live Cloud Share Link if generated */}
          {sosShareId ? (
            <View style={styles.shareIdBadge}>
              <Text style={styles.shareIdText}>
                {isOnline && sosCloudSynced
                  ? '🛰️ Real-Time Cloud Stream: '
                  : '🟠 Offline Local Session (Syncs when online): '}
                <Text style={styles.shareIdVal}>{sosShareId}</Text>
              </Text>
              <TouchableOpacity
                onPress={() => router.push(`/track?id=${sosShareId}`)}
                style={styles.openTrackerLink}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="View emergency contact tracker portal"
              >
                <Text style={styles.openTrackerLinkText}>View Contact Portal ➔</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.dispatchBox}>
            <Text style={styles.dispatchHeader}>Dispatched Safe Circle:</Text>
            {contacts.length > 0 ? (
              contacts.map((c) => (
                <Text key={c.id} style={styles.dispatchedContact}>
                  ✓ {c.name} ({c.phone}) - Simulated SMS Dispatched
                </Text>
              ))
            ) : (
              <Text style={styles.dispatchedContact}>
                {"⚠️ No trusted contacts added yet. Tap 'Trusted Contacts' below to add people you trust."}
              </Text>
            )}
          </View>

          {sosLocation ? (
            <View style={styles.locationBox}>
              <Text style={styles.locationText}>
                📍 Captured Location: {sosLocation.latitude.toFixed(5)}, {sosLocation.longitude.toFixed(5)}
              </Text>
              <Text style={styles.accuracyText}>
                Accuracy: {sosLocation.accuracy ? `±${Math.round(sosLocation.accuracy)}m` : 'Balanced'}
              </Text>
            </View>
          ) : (
            <Text style={styles.acquiringText}>📍 Acquiring GPS coordinates...</Text>
          )}

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.call112Button}
              onPress={() => callNumber('112')}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Call 112 emergency services"
              activeOpacity={0.85}
            >
              <Text style={styles.call112Text}>📞 Call 112</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shareCoordsButton}
              onPress={shareCoordinates}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Share emergency coordinates via SMS"
              activeOpacity={0.85}
            >
              <Text style={styles.shareCoordsText}>✉️ Send SMS</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.deactivateButton}
            onPress={handleDeactivateSOS}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Deactivate emergency SOS, I am safe now"
            activeOpacity={0.85}
          >
            <Text style={styles.deactivateText}>✓ I AM SAFE — DEACTIVATE SOS</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.connection}>
          <Text style={styles.connectionText}>🟢 App is ready</Text>
          <Text style={styles.smallText}>
            SOS triggers instant 5-second countdown with cancellation
          </Text>
        </View>
      )}

      {/* Main SOS Trigger Button */}
      <View style={styles.sosContainer}>
        <Text style={styles.sosTitle}>
          {sosActive ? 'Emergency Mode Active' : 'Need emergency help?'}
        </Text>
        <TouchableOpacity
          style={[styles.sosButton, sosActive && styles.sosButtonActive]}
          onPress={sosActive ? handleDeactivateSOS : handleStartSOS}
          activeOpacity={0.8}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={
            sosActive
              ? 'SOS is active. Double tap to deactivate.'
              : 'Emergency SOS button. Double tap to start 5 second emergency countdown.'
          }
          accessibilityHint="Starts emergency countdown with option to cancel"
        >
          <Text style={styles.sosText}>{sosActive ? 'SAFE' : 'SOS'}</Text>
          <Text style={styles.sosSubtext}>
            {sosActive ? 'TAP TO STOP' : 'TAP FOR 5S COUNTDOWN'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.sosDescription}>
          {sosActive
            ? 'Tap the button above when you are out of danger to deactivate.'
            : 'Tap SOS anytime. You will have 5 seconds to cancel before alerts trigger.'}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Your Safety Tools</Text>

      {/* 2x2 Grid of Safety Tools + Live Tracker */}
      <View style={styles.grid}>
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push('/contacts')}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Trusted Contacts. Manage your safe circle."
          activeOpacity={0.8}
        >
          <Text style={styles.cardIcon}>👥</Text>
          <Text style={styles.cardTitle}>Trusted Contacts</Text>
          <Text style={styles.cardDescription}>
            Manage your safe circle ({contacts.length} saved)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push('/location')}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="My Location. View GPS status and coordinates."
          activeOpacity={0.8}
        >
          <Text style={styles.cardIcon}>📍</Text>
          <Text style={styles.cardTitle}>My Location</Text>
          <Text style={styles.cardDescription}>Live GPS & Sharing</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push('/timer')}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Safety Timer. Plan your safe arrival."
          activeOpacity={0.8}
        >
          <Text style={styles.cardIcon}>⏱️</Text>
          <Text style={styles.cardTitle}>Safety Timer</Text>
          <Text style={styles.cardDescription}>
            Plan your safe arrival
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push('/track')}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Live Tracking Portal for emergency contacts"
          activeOpacity={0.8}
        >
          <Text style={styles.cardIcon}>🛰️</Text>
          <Text style={styles.cardTitle}>Live Tracker</Text>
          <Text style={styles.cardDescription}>
            Contact tracking portal
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, styles.cardFullWidth]}
          onPress={() => setEmergencyModalVisible(true)}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Emergency Help. View emergency directory hotlines."
          activeOpacity={0.8}
        >
          <View style={styles.hotlineRowCard}>
            <Text style={styles.cardIcon}>🚨</Text>
            <View>
              <Text style={styles.cardTitle}>Emergency Hotlines</Text>
              <Text style={styles.cardDescription}>
                1-tap direct access to 112, Police (100), Ambulance (108)
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>
        SafeNest • Safety without boundaries
      </Text>

      {/* SOS 5-Second Countdown Modal */}
      <Modal
        visible={countingDown}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCancelSOS}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.countdownBox} accessible={true} accessibilityRole="alert">
            <Text style={styles.countdownAlertIcon}>🚨</Text>
            <Text style={styles.countdownTitle}>EMERGENCY ALERT</Text>
            <Text style={styles.countdownSubtitle}>
              Alerting your emergency contacts in
            </Text>

            <View style={styles.timerCircle}>
              <Text style={styles.timerNumber}>{countdown}</Text>
              <Text style={styles.timerSec}>SECONDS</Text>
            </View>

            <Text style={styles.countdownWarning}>
              If this was a mistake or you are safe, cancel now.
            </Text>

            {/* Cancel Button */}
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancelSOS}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Cancel emergency countdown. I am safe."
              accessibilityHint="Double tap to cancel the emergency alert immediately"
              activeOpacity={0.85}
            >
              <Text style={styles.cancelButtonText}>✕ CANCEL — I AM SAFE</Text>
            </TouchableOpacity>

            {/* Immediate Send Button */}
            <TouchableOpacity
              style={styles.immediateButton}
              onPress={handleImmediateTrigger}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Trigger emergency SOS immediately without waiting"
              activeOpacity={0.8}
            >
              <Text style={styles.immediateButtonText}>SEND IMMEDIATELY ➔</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Emergency Hotlines Directory Modal */}
      <Modal
        visible={emergencyModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setEmergencyModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.directoryBox}>
            <View style={styles.directoryHeader}>
              <Text style={styles.directoryTitle}>🚨 Emergency Hotlines</Text>
              <TouchableOpacity
                onPress={() => setEmergencyModalVisible(false)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Close emergency directory"
                style={styles.closeModalButton}
              >
                <Text style={styles.closeModalText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.directorySubtitle}>
              Direct 1-tap connection to emergency helplines:
            </Text>

            {EMERGENCY_SERVICES.map((s) => (
              <TouchableOpacity
                key={s.number}
                style={styles.helplineRow}
                onPress={() => callNumber(s.number)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={`Call ${s.name} at ${s.number}`}
                activeOpacity={0.8}
              >
                <View style={styles.helplineInfo}>
                  <Text style={styles.helplineIcon}>{s.icon}</Text>
                  <View>
                    <Text style={styles.helplineName}>{s.name}</Text>
                    <Text style={styles.helphoneNumber}>{s.number}</Text>
                  </View>
                </View>
                <View style={styles.callBadge}>
                  <Text style={styles.callBadgeText}>CALL</Text>
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => setEmergencyModalVisible(false)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text style={styles.doneButtonText}>Close Directory</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#100D20',
  },
  content: {
    padding: 22,
    paddingTop: 10,
    paddingBottom: 40,
    maxWidth: 680,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 45,
    alignItems: 'center',
  },
  logo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  status: {
    color: '#A78BFA',
    fontSize: 12,
    fontWeight: '600',
  },
  statusActive: {
    color: '#FF6B6B',
    fontWeight: 'bold',
  },
  welcome: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: 'bold',
    marginTop: 25,
  },
  subtitle: {
    color: '#B8B3C9',
    fontSize: 14,
    marginTop: 8,
  },
  connection: {
    backgroundColor: '#211B36',
    padding: 16,
    borderRadius: 15,
    marginTop: 20,
  },
  connectionText: {
    color: '#86EFAC',
    fontWeight: 'bold',
  },
  smallText: {
    color: '#B8B3C9',
    fontSize: 12,
    marginTop: 6,
  },

  // Active SOS Banner
  sosActiveBanner: {
    backgroundColor: '#3E101D',
    borderColor: '#E63955',
    borderWidth: 2,
    borderRadius: 16,
    padding: 18,
    marginTop: 20,
  },
  sosActiveTitle: {
    color: '#FF4D6D',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  sosActiveSubtitle: {
    color: '#FFCAD4',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  shareIdBadge: {
    backgroundColor: '#240910',
    padding: 10,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  shareIdText: {
    color: '#FFFFFF',
    fontSize: 11,
  },
  shareIdVal: {
    color: '#86EFAC',
    fontWeight: 'bold',
  },
  openTrackerLink: {
    padding: 4,
  },
  openTrackerLinkText: {
    color: '#FF859A',
    fontSize: 11,
    fontWeight: 'bold',
  },
  dispatchBox: {
    backgroundColor: '#260B12',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  dispatchHeader: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  dispatchedContact: {
    color: '#98FB98',
    fontSize: 12,
    marginVertical: 2,
  },
  locationBox: {
    backgroundColor: '#260B12',
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  locationText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  accuracyText: {
    color: '#B8B3C9',
    fontSize: 11,
    marginTop: 2,
  },
  acquiringText: {
    color: '#FFD166',
    fontSize: 12,
    marginBottom: 14,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  call112Button: {
    flex: 1,
    backgroundColor: '#E63955',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  call112Text: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  shareCoordsButton: {
    flex: 1,
    backgroundColor: '#8B5CF6',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  shareCoordsText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  deactivateButton: {
    backgroundColor: '#2B7A4B',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  deactivateText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 0.5,
  },

  // SOS Container
  sosContainer: {
    alignItems: 'center',
    backgroundColor: '#211B36',
    padding: 22,
    borderRadius: 22,
    marginTop: 20,
  },
  sosTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  sosButton: {
    width: 160,
    height: 160,
    borderRadius: 100,
    backgroundColor: '#E63955',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 7,
    borderColor: '#54263E',
    shadowColor: '#E63955',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  sosButtonActive: {
    backgroundColor: '#2B7A4B',
    borderColor: '#1D4E31',
    shadowColor: '#2B7A4B',
  },
  sosText: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: 'bold',
  },
  sosSubtext: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 3,
  },
  sosDescription: {
    color: '#B8B3C9',
    marginTop: 16,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 28,
    marginBottom: 15,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    backgroundColor: '#211B36',
    width: '48%',
    padding: 16,
    borderRadius: 16,
    marginBottom: 14,
    minHeight: 120,
    justifyContent: 'space-between',
  },
  cardFullWidth: {
    width: '100%',
    minHeight: 80,
  },
  hotlineRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardIcon: {
    fontSize: 28,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    marginTop: 6,
    fontSize: 14,
  },
  cardDescription: {
    color: '#B8B3C9',
    fontSize: 11,
    marginTop: 4,
  },
  footer: {
    color: '#817A96',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 30,
    fontSize: 12,
  },

  // Modal Overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  countdownBox: {
    backgroundColor: '#1E152A',
    borderColor: '#E63955',
    borderWidth: 2,
    borderRadius: 24,
    padding: 26,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  countdownAlertIcon: {
    fontSize: 42,
    marginBottom: 8,
  },
  countdownTitle: {
    color: '#FF4D6D',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
  },
  countdownSubtitle: {
    color: '#E0DBEC',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  timerCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#2B1220',
    borderColor: '#E63955',
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  timerNumber: {
    color: '#FFFFFF',
    fontSize: 64,
    fontWeight: '900',
  },
  timerSec: {
    color: '#FF859A',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  countdownWarning: {
    color: '#B8B3C9',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 24,
  },
  cancelButton: {
    backgroundColor: '#2B7A4B',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
    minHeight: 54,
    justifyContent: 'center',
    marginBottom: 12,
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  immediateButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  immediateButtonText: {
    color: '#FF859A',
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },

  // Directory Modal
  directoryBox: {
    backgroundColor: '#1E152A',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  directoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  directoryTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeModalButton: {
    padding: 6,
    minWidth: 40,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeModalText: {
    color: '#B8B3C9',
    fontSize: 18,
    fontWeight: 'bold',
  },
  directorySubtitle: {
    color: '#B8B3C9',
    fontSize: 13,
    marginBottom: 18,
  },
  helplineRow: {
    backgroundColor: '#29213D',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    minHeight: 60,
  },
  helplineInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  helplineIcon: {
    fontSize: 24,
  },
  helplineName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  helphoneNumber: {
    color: '#A78BFA',
    fontSize: 13,
    marginTop: 2,
    fontWeight: '600',
  },
  callBadge: {
    backgroundColor: '#E63955',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  callBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  doneButton: {
    backgroundColor: '#352C4D',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
});