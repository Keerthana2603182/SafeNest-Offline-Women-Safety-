import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LiveShareSession, subscribeToLiveLocation } from '@/lib/safety-service';

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
      Alert.alert('Missing ID', 'Please enter a valid SafeNest tracking ID.');
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
        Alert.alert('Emergency Helpline', 'Dial 112 on your phone.');
      }
    } catch {
      Alert.alert('Emergency Helpline', 'Dial 112 on your phone.');
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
          accessibilityLabel="Back to previous screen"
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerBadge}>🛡️ Contact Portal</Text>
      </View>

      <Text style={styles.heading} accessibilityRole="header">Live Emergency Tracking</Text>
      <Text style={styles.subtitle}>
        Real-time GPS tracker for emergency contacts. Updates stream live as the user moves.
      </Text>

      {/* Track ID Search Bar */}
      <View style={styles.searchCard}>
        <Text style={styles.searchLabel}>SafeNest Tracking ID:</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="e.g. sn_1a2b3c"
            placeholderTextColor="#999"
            value={shareIdInput}
            onChangeText={setShareIdInput}
            autoCapitalize="none"
            autoCorrect={false}
            accessible={true}
            accessibilityLabel="Tracking session ID"
          />
          <TouchableOpacity
            style={styles.searchButton}
            onPress={handleSearch}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Connect to live tracker"
            activeOpacity={0.8}
          >
            <Text style={styles.searchButtonText}>Track</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.statusBox}>
          <Text style={styles.statusBoxText}>Connecting to satellite live stream…</Text>
        </View>
      ) : session?.status === 'revoked' ? (
        <View style={styles.revokedCard} accessible={true} accessibilityRole="alert">
          <View style={styles.revokedHeader}>
            <Text style={styles.revokedIcon}>🔒</Text>
            <Text style={styles.revokedTitle}>Location Sharing Revoked</Text>
          </View>
          <Text style={styles.revokedSubtitle}>
            {session.userName} has ended location sharing and revoked access to this tracking session.
          </Text>
          <View style={styles.revokedDetailsBox}>
            <Text style={styles.revokedDetailsText}>
              • Real-time GPS broadcast has been terminated.
            </Text>
            <Text style={styles.revokedDetailsText}>
              • Coordinate telemetry has been purged for security.
            </Text>
            <Text style={styles.revokedDetailsText}>
              • Session ended: {new Date(session.updatedAt).toLocaleTimeString()}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.backHomeBtn}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/');
              }
            }}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Return to previous screen"
          >
            <Text style={styles.backHomeBtnText}>← Return to Safety Dashboard</Text>
          </TouchableOpacity>
        </View>
      ) : session ? (
        <View style={styles.sessionCard}>
          {/* Status Header */}
          <View
            style={[
              styles.statusBanner,
              session.status === 'sos' && styles.statusBannerSOS,
            ]}
          >
            <Text style={styles.statusBannerTitle}>
              {session.status === 'sos'
                ? '🚨 EMERGENCY SOS ACTIVE'
                : session.status === 'active'
                ? '🟢 LIVE LOCATION STREAMING'
                : '✓ USER REPORTED SAFE'}
            </Text>
            <Text style={styles.statusBannerSubtitle}>
              {session.userName} •{' '}
              {secondsAgo === 0 ? 'Updated just now' : `Updated ${secondsAgo}s ago`}
            </Text>
          </View>

          {/* Interactive Radar Visual */}
          <View style={styles.radarBox}>
            <View style={styles.radarRing1}>
              <View style={styles.radarRing2}>
                <View style={styles.radarCenter}>
                  <Text style={styles.centerIcon}>
                    {session.status === 'sos' ? '🚨' : '📍'}
                  </Text>
                </View>
              </View>
            </View>
            <Text style={styles.radarCoordinates}>
              {session.latitude.toFixed(6)}°, {session.longitude.toFixed(6)}°
            </Text>
            <Text style={styles.radarAccuracy}>
              Accuracy: {session.accuracy ? `±${Math.round(session.accuracy)} meters` : 'High Precision'}
            </Text>
          </View>

          {/* Note if provided */}
          {session.note ? (
            <View style={styles.noteBox}>
              <Text style={styles.noteLabel}>Journey / SOS Note:</Text>
              <Text style={styles.noteText}>{`"${session.note}"`}</Text>
            </View>
          ) : null}

          {/* Telemetry Grid */}
          <View style={styles.telemetryGrid}>
            <View style={styles.telemetryCell}>
              <Text style={styles.telemetryLabel}>Speed</Text>
              <Text style={styles.telemetryVal}>
                {session.speed && session.speed > 0
                  ? `${(session.speed * 3.6).toFixed(1)} km/h`
                  : 'Stationary'}
              </Text>
            </View>
            <View style={styles.telemetryCell}>
              <Text style={styles.telemetryLabel}>Altitude</Text>
              <Text style={styles.telemetryVal}>
                {session.altitude ? `${Math.round(session.altitude)} m` : 'Sea level'}
              </Text>
            </View>
            <View style={styles.telemetryCell}>
              <Text style={styles.telemetryLabel}>Started At</Text>
              <Text style={styles.telemetryVal}>
                {new Date(session.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <View style={styles.telemetryCell}>
              <Text style={styles.telemetryLabel}>Last Ping</Text>
              <Text style={styles.telemetryVal}>
                {new Date(session.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </Text>
            </View>
          </View>

          {/* Navigation Action Buttons */}
          <TouchableOpacity
            style={styles.directionsBtn}
            onPress={openDirections}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Get live directions to user's location"
            activeOpacity={0.85}
          >
            <Text style={styles.directionsBtnText}>🧭 GET DIRECTIONS IN GOOGLE MAPS</Text>
          </TouchableOpacity>

          {session.status === 'sos' ? (
            <TouchableOpacity
              style={styles.emergencyCallBtn}
              onPress={callEmergency}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Call emergency services 112"
              activeOpacity={0.85}
            >
              <Text style={styles.emergencyCallText}>📞 Call Emergency Services (112)</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : activeShareId ? (
        <View style={styles.notFoundCard}>
          <Text style={styles.notFoundIcon}>🔍</Text>
          <Text style={styles.notFoundTitle}>Session Not Found or Expired</Text>
          <Text style={styles.notFoundText}>
            The tracking ID {`"${activeShareId}"`} does not exist or has expired. Make sure the user has an active sharing session.
          </Text>
        </View>
      ) : (
        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsTitle}>ℹ️ How Emergency Tracking Works</Text>
          <Text style={styles.instructionItem}>
            1. When a user triggers SOS or starts live sharing, SafeNest generates a secure tracking link.
          </Text>
          <Text style={styles.instructionItem}>
            2. Emergency contacts can open the link in any web browser on Android, iPhone, Mac, or PC.
          </Text>
          <Text style={styles.instructionItem}>
            3. Coordinates and speed update live without needing to install the app.
          </Text>
        </View>
      )}
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
    paddingTop: 55,
    paddingBottom: 40,
    maxWidth: 680,
    alignSelf: 'center',
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
  headerBadge: {
    color: '#86EFAC',
    fontSize: 13,
    fontWeight: '700',
  },
  heading: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#BDB6D0',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 20,
  },
  searchCard: {
    backgroundColor: '#211B36',
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
  },
  searchLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#2E2648',
    color: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    fontSize: 15,
    minHeight: 48,
  },
  searchButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 20,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 48,
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  statusBox: {
    padding: 30,
    alignItems: 'center',
  },
  statusBoxText: {
    color: '#A78BFA',
    fontSize: 15,
  },
  sessionCard: {
    backgroundColor: '#211B36',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#3D315C',
    marginBottom: 20,
  },
  statusBanner: {
    backgroundColor: '#1E382A',
    borderColor: '#2B7A4B',
    borderWidth: 1.5,
    padding: 14,
    borderRadius: 14,
    marginBottom: 16,
  },
  statusBannerSOS: {
    backgroundColor: '#3E101D',
    borderColor: '#E63955',
  },
  statusBannerRevoked: {
    backgroundColor: '#292138',
    borderColor: '#54466F',
  },
  statusBannerTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  statusBannerSubtitle: {
    color: '#D8D1E8',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  radarBox: {
    backgroundColor: '#171126',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  radarRing1: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 1.5,
    borderColor: '#43346B',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  radarRing2: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    borderColor: '#6D56A8',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#24193D',
  },
  radarCenter: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerIcon: {
    fontSize: 18,
  },
  radarCoordinates: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  radarAccuracy: {
    color: '#86EFAC',
    fontSize: 12,
    marginTop: 4,
  },
  noteBox: {
    backgroundColor: '#2A2142',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  noteLabel: {
    color: '#BDB6D0',
    fontSize: 11,
    fontWeight: '600',
  },
  noteText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 2,
  },
  telemetryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  telemetryCell: {
    backgroundColor: '#2E2648',
    width: '48%',
    padding: 12,
    borderRadius: 10,
  },
  telemetryLabel: {
    color: '#BDB6D0',
    fontSize: 11,
  },
  telemetryVal: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 4,
  },
  directionsBtn: {
    backgroundColor: '#2563EB',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    marginBottom: 10,
  },
  directionsBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  emergencyCallBtn: {
    backgroundColor: '#E63955',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  emergencyCallText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  notFoundCard: {
    backgroundColor: '#211B36',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  notFoundIcon: {
    fontSize: 36,
    marginBottom: 10,
  },
  notFoundTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  notFoundText: {
    color: '#BDB6D0',
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
  },
  instructionsCard: {
    backgroundColor: '#1E1730',
    borderRadius: 16,
    padding: 20,
  },
  instructionsTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  instructionItem: {
    color: '#BDB6D0',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 8,
  },
  revokedCard: {
    backgroundColor: '#211B36',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1.5,
    borderColor: '#4A3B66',
    marginBottom: 20,
  },
  revokedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  revokedIcon: {
    fontSize: 26,
  },
  revokedTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: 'bold',
  },
  revokedSubtitle: {
    color: '#D8D1E8',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
  },
  revokedDetailsBox: {
    backgroundColor: '#181228',
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
    gap: 6,
  },
  revokedDetailsText: {
    color: '#BDB6D0',
    fontSize: 13,
    lineHeight: 19,
  },
  backHomeBtn: {
    backgroundColor: '#8B5CF6',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  backHomeBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
