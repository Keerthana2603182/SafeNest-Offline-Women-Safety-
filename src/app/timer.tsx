import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import {
  clearPersistentTimer,
  getPersistentTimer,
  savePersistentTimer,
} from '../lib/safety-service';

const PRESET_DURATIONS = [
  { label: '5 min', minutes: 5, description: 'Quick walk / car' },
  { label: '15 min', minutes: 15, description: 'Transit / commute' },
  { label: '30 min', minutes: 30, description: 'Walking home' },
  { label: '60 min', minutes: 60, description: 'Long journey' },
];

export default function SafetyTimerScreen() {
  const router = useRouter();

  // Configuration
  const [selectedMinutes, setSelectedMinutes] = useState(15);
  const [activityNote, setActivityNote] = useState('Walking home');

  // Active Timer State
  const [isActive, setIsActive] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(15 * 60);
  const [initialSeconds, setInitialSeconds] = useState(15 * 60);
  const [isExpired, setIsExpired] = useState(false);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [estimatedArrival, setEstimatedArrival] = useState<string | null>(null);

  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetEndTimeRef = useRef<number | null>(null);

  function triggerVibration(pattern: number | number[]) {
    if (Platform.OS !== 'web') {
      try {
        Vibration.vibrate(pattern);
      } catch {
        // Quiet fallback
      }
    }
  }

  function handleTimerExpired() {
    setIsActive(false);
    setIsExpired(true);
    triggerVibration([0, 600, 200, 600, 200, 900]);

    if (targetEndTimeRef.current) {
      void savePersistentTimer({
        isActive: false,
        initialSeconds,
        targetEndTime: targetEndTimeRef.current,
        activityNote,
        startedAt: Date.now() - initialSeconds * 1000,
        status: 'overdue',
      });
    }

    Alert.alert(
      '⚠️ Safety Timer Expired!',
      `You have not checked in for your journey: "${activityNote}". Are you safe, or do you need to trigger emergency SOS?`,
      [
        {
          text: 'I Am Safe',
          style: 'cancel',
          onPress: () => {
            setIsExpired(false);
            void clearPersistentTimer();
            triggerVibration(100);
          },
        },
        {
          text: 'Trigger SOS Now',
          style: 'destructive',
          onPress: () => {
            setIsExpired(false);
            void clearPersistentTimer();
            router.push('/');
          },
        },
      ]
    );
  }

  function runTimerLoop() {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    timerIntervalRef.current = setInterval(() => {
      if (!targetEndTimeRef.current) return;
      const remaining = Math.max(0, Math.round((targetEndTimeRef.current - Date.now()) / 1000));
      setRemainingSeconds(remaining);

      if (remaining <= 0) {
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        handleTimerExpired();
      }
    }, 1000);
  }

  // Restore persistent timer on mount
  useEffect(() => {
    async function restoreTimer() {
      const saved = await getPersistentTimer();
      if (saved && saved.isActive) {
        setActivityNote(saved.activityNote);
        setInitialSeconds(saved.initialSeconds);
        targetEndTimeRef.current = saved.targetEndTime;

        const start = new Date(saved.startedAt);
        setStartTime(start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

        const arrival = new Date(saved.targetEndTime);
        setEstimatedArrival(arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

        const remaining = Math.max(0, Math.round((saved.targetEndTime - Date.now()) / 1000));
        setRemainingSeconds(remaining);

        if (remaining <= 0) {
          setIsActive(false);
          setIsExpired(true);
        } else {
          setIsActive(true);
          setIsExpired(false);
          runTimerLoop();
        }
      }
    }

    void restoreTimer();

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startTimer() {
    const totalSecs = selectedMinutes * 60;
    const now = Date.now();
    targetEndTimeRef.current = now + totalSecs * 1000;

    setInitialSeconds(totalSecs);
    setRemainingSeconds(totalSecs);
    setIsActive(true);
    setIsExpired(false);

    const startDate = new Date(now);
    setStartTime(startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    const arrival = new Date(targetEndTimeRef.current);
    setEstimatedArrival(arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    triggerVibration([0, 200, 100, 200]);

    // Persist to storage & cloud
    void savePersistentTimer({
      isActive: true,
      initialSeconds: totalSecs,
      targetEndTime: targetEndTimeRef.current,
      activityNote,
      startedAt: now,
      status: 'running',
    });

    runTimerLoop();
  }

  function checkInSafe() {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    targetEndTimeRef.current = null;
    setIsActive(false);
    setIsExpired(false);
    triggerVibration(200);

    void clearPersistentTimer();

    Alert.alert(
      'Safe Arrival Confirmed! 🎉',
      `You checked in safely for: "${activityNote}". Your safety timer has been successfully completed.`,
      [{ text: 'OK' }]
    );
  }

  function extendTimer(additionalMinutes: number) {
    const additionalSecs = additionalMinutes * 60;
    if (targetEndTimeRef.current) {
      targetEndTimeRef.current += additionalSecs * 1000;
    } else {
      targetEndTimeRef.current = Date.now() + (remainingSeconds + additionalSecs) * 1000;
    }

    const updatedRemaining = Math.max(0, Math.round((targetEndTimeRef.current - Date.now()) / 1000));
    setRemainingSeconds(updatedRemaining);
    setInitialSeconds((prev) => prev + additionalSecs);
    triggerVibration(150);

    const updatedArrival = new Date(targetEndTimeRef.current);
    setEstimatedArrival(updatedArrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    // Persist extended timer
    void savePersistentTimer({
      isActive: true,
      initialSeconds: initialSeconds + additionalSecs,
      targetEndTime: targetEndTimeRef.current,
      activityNote,
      startedAt: Date.now() - (initialSeconds + additionalSecs - updatedRemaining) * 1000,
      status: 'running',
    });

    Alert.alert('Timer Extended', `Added +${additionalMinutes} minutes to your arrival window.`);
  }

  function cancelTimer() {
    Alert.alert(
      'Cancel Safety Timer?',
      'Are you sure you want to stop this safety timer without confirming safe arrival?',
      [
        { text: 'Keep Running', style: 'cancel' },
        {
          text: 'Stop Timer',
          style: 'destructive',
          onPress: () => {
            if (timerIntervalRef.current) {
              clearInterval(timerIntervalRef.current);
              timerIntervalRef.current = null;
            }
            targetEndTimeRef.current = null;
            setIsActive(false);
            setIsExpired(false);
            void clearPersistentTimer();
            triggerVibration(100);
          },
        },
      ]
    );
  }

  function formatTime(totalSecs: number) {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  const progressPercent = initialSeconds > 0
    ? Math.max(0, Math.min(100, Math.round(((initialSeconds - remainingSeconds) / initialSeconds) * 100)))
    : 0;

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Go back to dashboard"
          >
            <Text style={styles.backButtonText}>← Dashboard</Text>
          </TouchableOpacity>
          <Text style={styles.headerBadge}>⏱️ Safety Timer</Text>
        </View>

        <Text style={styles.heading} accessibilityRole="header">Safe Arrival Timer</Text>
        <Text style={styles.subtitle}>
          {"Set a timer when walking alone, commuting, or meeting someone. If you don't check in before it expires, SafeNest prompts emergency escalation."}
        </Text>

        {/* Expired Warning Banner */}
        {isExpired ? (
          <View style={styles.expiredBanner} accessible={true} accessibilityRole="alert">
            <Text style={styles.expiredBannerTitle}>⚠️ TIMER OVERDUE</Text>
            <Text style={styles.expiredBannerText}>
              Your scheduled arrival time has passed. Tap below to confirm you are safe or trigger emergency help.
            </Text>
            <View style={styles.expiredActions}>
              <TouchableOpacity
                style={styles.safeExpiredButton}
                onPress={() => setIsExpired(false)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="I am safe"
              >
                <Text style={styles.safeExpiredText}>✓ I Am Safe</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sosExpiredButton}
                onPress={() => router.push('/')}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Go to SOS Emergency screen"
              >
                <Text style={styles.sosExpiredText}>🚨 Go to SOS</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Active Timer Display */}
        {isActive ? (
          <View style={styles.activeCard} accessible={true} accessibilityRole="timer">
            <Text style={styles.activeTitle}>JOURNEY IN PROGRESS</Text>
            <Text style={styles.activeActivity}>{`"${activityNote}"`}</Text>

            <View style={styles.countdownBox}>
              <Text style={styles.countdownDigits}>{formatTime(remainingSeconds)}</Text>
              <Text style={styles.countdownLabel}>REMAINING</Text>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
            </View>
            <Text style={styles.progressText}>{progressPercent}% of journey completed</Text>

            <View style={styles.timeMeta}>
              <Text style={styles.metaItem}>Started: {startTime}</Text>
              <Text style={styles.metaItem}>Expected by: {estimatedArrival}</Text>
            </View>

            {/* Check-in Safe Button */}
            <TouchableOpacity
              style={styles.checkInButton}
              onPress={checkInSafe}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="I have arrived safely. Double tap to stop safety timer."
              activeOpacity={0.85}
            >
              <Text style={styles.checkInText}>✓ I HAVE ARRIVED SAFELY</Text>
            </TouchableOpacity>

            {/* Extensions */}
            <Text style={styles.extendHeader}>Running late? Add time:</Text>
            <View style={styles.extendRow}>
              <TouchableOpacity
                style={styles.extendButton}
                onPress={() => extendTimer(5)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Add 5 minutes to safety timer"
                activeOpacity={0.8}
              >
                <Text style={styles.extendButtonText}>+5 Min</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.extendButton}
                onPress={() => extendTimer(15)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Add 15 minutes to safety timer"
                activeOpacity={0.8}
              >
                <Text style={styles.extendButtonText}>+15 Min</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelLink}
                onPress={cancelTimer}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Cancel timer without check-in"
                activeOpacity={0.7}
              >
                <Text style={styles.cancelLinkText}>Stop</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* Timer Setup Section */
          <View style={styles.setupCard}>
            <Text style={styles.sectionLabel}>1. What are you doing?</Text>
            <TextInput
              style={styles.activityInput}
              placeholder="e.g. Walking home, Taking cab #1234"
              placeholderTextColor="#999"
              value={activityNote}
              onChangeText={setActivityNote}
              accessible={true}
              accessibilityLabel="Journey activity or destination note"
              accessibilityHint="Type where you are going or what you are doing"
            />

            <Text style={styles.sectionLabel}>2. Select expected duration:</Text>
            <View style={styles.presetsGrid}>
              {PRESET_DURATIONS.map((preset) => {
                const isSelected = selectedMinutes === preset.minutes;
                return (
                  <TouchableOpacity
                    key={preset.minutes}
                    style={[styles.presetCard, isSelected && styles.presetCardSelected]}
                    onPress={() => setSelectedMinutes(preset.minutes)}
                    accessible={true}
                    accessibilityRole="button"
                    accessibilityLabel={`${preset.label}, ${preset.description}`}
                    accessibilityState={{ selected: isSelected }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.presetLabel, isSelected && styles.presetLabelSelected]}>
                      {preset.label}
                    </Text>
                    <Text style={styles.presetDesc}>{preset.description}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.startButton}
              onPress={startTimer}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel={`Start ${selectedMinutes} minute safety timer for ${activityNote}`}
              activeOpacity={0.85}
            >
              <Text style={styles.startButtonText}>
                ▶ START {selectedMinutes}-MIN SAFETY TIMER
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.howItWorksCard}>
          <Text style={styles.howItWorksTitle}>💡 How Safe Arrival Works</Text>
          <Text style={styles.howItWorksItem}>
            • When you start the timer, SafeNest actively monitors your arrival window.
          </Text>
          <Text style={styles.howItWorksItem}>
            {"• If you get delayed in traffic or run into a friend, tap '+5 Min' or '+15 Min' to extend."}
          </Text>
          <Text style={styles.howItWorksItem}>
            {"• When you reach your destination, tap 'I Have Arrived Safely' to close the timer."}
          </Text>
          <Text style={styles.howItWorksItem}>
            • If the timer expires before check-in, an urgent alarm sounds to confirm your well-being.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: '#100D20',
  },
  container: {
    flex: 1,
    backgroundColor: '#100D20',
  },
  content: {
    padding: 22,
    paddingTop: 55,
    paddingBottom: 40,
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

  // Setup Card
  setupCard: {
    backgroundColor: '#211B36',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  sectionLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 10,
    marginTop: 4,
  },
  activityInput: {
    backgroundColor: '#2E2648',
    color: '#FFFFFF',
    padding: 15,
    borderRadius: 12,
    fontSize: 15,
    marginBottom: 20,
    minHeight: 50,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 22,
  },
  presetCard: {
    backgroundColor: '#2E2648',
    width: '48%',
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    minHeight: 70,
    justifyContent: 'center',
  },
  presetCardSelected: {
    borderColor: '#8B5CF6',
    backgroundColor: '#372A5C',
  },
  presetLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  presetLabelSelected: {
    color: '#C4A5FF',
  },
  presetDesc: {
    color: '#B8B3C9',
    fontSize: 11,
    marginTop: 4,
  },
  startButton: {
    backgroundColor: '#8B5CF6',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // Active Timer Card
  activeCard: {
    backgroundColor: '#211B36',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#8B5CF6',
  },
  activeTitle: {
    color: '#86EFAC',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  activeActivity: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 6,
    textAlign: 'center',
  },
  countdownBox: {
    marginTop: 18,
    marginBottom: 16,
    alignItems: 'center',
  },
  countdownDigits: {
    color: '#FFFFFF',
    fontSize: 54,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  countdownLabel: {
    color: '#A78BFA',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    backgroundColor: '#2E2648',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#86EFAC',
  },
  progressText: {
    color: '#B8B3C9',
    fontSize: 11,
    marginBottom: 14,
  },
  timeMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#2E2648',
    marginBottom: 20,
  },
  metaItem: {
    color: '#E0DBEC',
    fontSize: 12,
  },
  checkInButton: {
    backgroundColor: '#2B7A4B',
    width: '100%',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    marginBottom: 16,
  },
  checkInText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  extendHeader: {
    color: '#B8B3C9',
    fontSize: 12,
    marginBottom: 8,
  },
  extendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    justifyContent: 'center',
  },
  extendButton: {
    backgroundColor: '#372A5C',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  extendButtonText: {
    color: '#D8C9FF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  cancelLink: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: 'center',
  },
  cancelLinkText: {
    color: '#FF8585',
    fontSize: 13,
    fontWeight: '600',
  },

  // Expired Warning Banner
  expiredBanner: {
    backgroundColor: '#3E101D',
    borderColor: '#E63955',
    borderWidth: 2,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  expiredBannerTitle: {
    color: '#FF4D6D',
    fontSize: 16,
    fontWeight: '900',
  },
  expiredBannerText: {
    color: '#FFCAD4',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 12,
    lineHeight: 18,
  },
  expiredActions: {
    flexDirection: 'row',
    gap: 10,
  },
  safeExpiredButton: {
    flex: 1,
    backgroundColor: '#2B7A4B',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  safeExpiredText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  sosExpiredButton: {
    flex: 1,
    backgroundColor: '#E63955',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  sosExpiredText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },

  // Informational Card
  howItWorksCard: {
    backgroundColor: '#1E1730',
    padding: 18,
    borderRadius: 16,
  },
  howItWorksTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  howItWorksItem: {
    color: '#B8B3C9',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
});
