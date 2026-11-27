import React, { useEffect, useRef, useState } from 'react';
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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Palette, Radius, Spacing } from '@/constants/theme';
import { GlassCard } from '@/components/ui/glass-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { TacticalButton } from '@/components/ui/tactical-button';
import {
  clearPersistentTimer,
  getPersistentTimer,
  savePersistentTimer,
} from '@/lib/safety-service';

const PRESET_DURATIONS = [
  { label: '5 min', minutes: 5, description: 'Quick walk / transit stop', icon: 'walk' },
  { label: '15 min', minutes: 15, description: 'Commute / short drive', icon: 'car' },
  { label: '30 min', minutes: 30, description: 'Walking home / night', icon: 'moon' },
  { label: '60 min', minutes: 60, description: 'Long journey / transit', icon: 'airplane' },
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
        // Fallback
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
      `You have not checked in for: "${activityNote}". Are you safe, or do you need to trigger emergency SOS?`,
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
            router.push({ pathname: '/', params: { trigger: 'sos' } });
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
      'Safe Arrival Verified! 🎉',
      `You checked in safely for: "${activityNote}". Sentinel deactivated.`,
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

    void savePersistentTimer({
      isActive: true,
      initialSeconds: initialSeconds + additionalSecs,
      targetEndTime: targetEndTimeRef.current,
      activityNote,
      startedAt: Date.now() - (initialSeconds + additionalSecs - updatedRemaining) * 1000,
      status: 'running',
    });

    Alert.alert('Window Extended', `Added +${additionalMinutes} minutes to your arrival window.`);
  }

  function cancelTimer() {
    Alert.alert(
      'Cancel Safety Watch?',
      'Are you sure you want to stop this safety timer without confirming safe arrival?',
      [
        { text: 'Keep Running', style: 'cancel' },
        {
          text: 'Stop Watch',
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

  function adjustMinutes(delta: number) {
    setSelectedMinutes((prev) => Math.max(5, Math.min(180, prev + delta)));
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
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Navigation & Status Header */}
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

          <StatusBadge
            label={isActive ? 'SENTINEL ENGAGED' : 'STANDBY'}
            variant={isActive ? 'lime' : 'neutral'}
            pulse={isActive}
          />
        </View>

        {/* Editorial Header */}
        <View style={styles.editorialHeader}>
          <Text style={styles.kicker}>AUTONOMOUS PROTOCOL</Text>
          <Text style={styles.heading}>Safe Arrival Watch.</Text>
          <Text style={styles.subheading}>
            Set your expected journey window. If you don’t check in before it expires, SafeNest prompts immediate emergency escalation.
          </Text>
        </View>

        {/* Expired Warning Banner */}
        {isExpired && (
          <GlassCard variant="danger" style={styles.expiredBanner}>
            <View style={styles.expiredHeader}>
              <View style={styles.expiredIconOrb}>
                <Ionicons name="alert" size={20} color={Palette.accentCoral} />
              </View>
              <View>
                <Text style={styles.expiredTitle}>ARRIVAL WINDOW OVERDUE</Text>
                <Text style={styles.expiredDesc}>Your scheduled check-in window has elapsed.</Text>
              </View>
            </View>

            <View style={styles.expiredActions}>
              <TacticalButton
                label="✓ I Am Safe"
                variant="primary"
                onPress={() => {
                  setIsExpired(false);
                  void clearPersistentTimer();
                }}
                style={styles.expiredBtn}
              />
              <TacticalButton
                label="🚨 Trigger SOS Now"
                variant="coral"
                onPress={() => router.push({ pathname: '/', params: { trigger: 'sos' } })}
                style={styles.expiredBtn}
              />
            </View>
          </GlassCard>
        )}

        {/* Active Journey Card */}
        {isActive ? (
          <GlassCard variant="elevated" style={styles.activeCard}>
            <View style={styles.activeBadgeRow}>
              <View style={styles.activePill}>
                <View style={styles.activeDot} />
                <Text style={styles.activePillText}>WATCH IN PROGRESS</Text>
              </View>
              <Text style={styles.progressPercentText}>{progressPercent}% ELAPSED</Text>
            </View>

            <Text style={styles.destinationTitle}>&ldquo;{activityNote}&rdquo;</Text>

            {/* Glowing Big Digital Clock */}
            <View style={styles.clockRing}>
              <Text style={styles.clockDigits}>{formatTime(remainingSeconds)}</Text>
              <Text style={styles.clockSub}>TIME REMAINING</Text>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
            </View>

            <View style={styles.metaStrip}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>STARTED</Text>
                <Text style={styles.metaVal}>{startTime ?? '—'}</Text>
              </View>
              <View style={styles.metaDivider} />
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>ESTIMATED ARRIVAL</Text>
                <Text style={[styles.metaVal, { color: Palette.accentLime }]}>{estimatedArrival ?? '—'}</Text>
              </View>
            </View>

            {/* Primary Check-In Button */}
            <TacticalButton
              label="✓ I Have Arrived Safely"
              variant="primary"
              icon={<Ionicons name="checkmark-circle" size={18} color="#0A0C10" />}
              onPress={checkInSafe}
              style={styles.checkInBtn}
            />

            <View style={styles.activeAuxRow}>
              <TacticalButton
                label="+15 Min Extend"
                variant="secondary"
                icon={<Ionicons name="add-circle-outline" size={16} color={Palette.textPrimary} />}
                onPress={() => extendTimer(15)}
                style={styles.auxBtn}
              />
              <TacticalButton
                label="Cancel Watch"
                variant="ghost"
                onPress={cancelTimer}
                style={styles.auxBtn}
              />
            </View>
          </GlassCard>
        ) : (
          /* Pre-Flight Configuration Console */
          <View style={styles.configConsole}>
            {/* Destination Note Card */}
            <GlassCard style={styles.inputCard}>
              <Text style={styles.configCardTitle}>DESTINATION & NOTES</Text>
              <TextInput
                style={styles.noteInput}
                placeholder="e.g. Walking home from Metro, Taking Uber #48"
                placeholderTextColor={Palette.textMuted}
                value={activityNote}
                onChangeText={setActivityNote}
              />
            </GlassCard>

            {/* Preset Cards Grid */}
            <View style={styles.presetSectionHeader}>
              <Text style={styles.presetSectionTitle}>SELECT ARRIVAL WINDOW</Text>
              <Text style={styles.presetSectionMeta}>{selectedMinutes} MINUTES</Text>
            </View>

            <View style={styles.presetsGrid}>
              {PRESET_DURATIONS.map((preset) => {
                const isSelected = selectedMinutes === preset.minutes;
                return (
                  <TouchableOpacity
                    key={preset.minutes}
                    style={[styles.presetCard, isSelected && styles.presetCardSelected]}
                    onPress={() => setSelectedMinutes(preset.minutes)}
                    activeOpacity={0.82}
                  >
                    <View style={styles.presetTop}>
                      <Ionicons
                        name={preset.icon as any}
                        size={18}
                        color={isSelected ? Palette.accentLime : Palette.textMuted}
                      />
                      <Text style={[styles.presetLabel, isSelected && styles.presetLabelSelected]}>
                        {preset.label}
                      </Text>
                    </View>
                    <Text style={styles.presetDesc}>{preset.description}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom Minutes Stepper */}
            <GlassCard style={styles.stepperCard}>
              <View>
                <Text style={styles.stepperTitle}>Fine-Tune Window</Text>
                <Text style={styles.stepperSub}>Adjust duration by 5-minute increments</Text>
              </View>
              <View style={styles.stepperControls}>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustMinutes(-5)}>
                  <Ionicons name="remove" size={18} color={Palette.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.stepperNumber}>{selectedMinutes}m</Text>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustMinutes(5)}>
                  <Ionicons name="add" size={18} color={Palette.textPrimary} />
                </TouchableOpacity>
              </View>
            </GlassCard>

            {/* Engage Button */}
            <TacticalButton
              label={`Engage Arrival Watch (${selectedMinutes} min)`}
              variant="primary"
              icon={<Ionicons name="shield-checkmark" size={18} color="#0A0C10" />}
              onPress={startTimer}
              style={styles.engageBtn}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
    color: Palette.accentLime,
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

  // Overdue Banner
  expiredBanner: {
    marginBottom: Spacing.four,
  },
  expiredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: Spacing.three,
  },
  expiredIconOrb: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.accentCoralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expiredTitle: {
    color: Palette.accentCoral,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  expiredDesc: {
    color: Palette.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  expiredActions: {
    flexDirection: 'row',
    gap: 10,
  },
  expiredBtn: {
    flex: 1,
    minHeight: 44,
  },

  // Active Journey Card
  activeCard: {
    padding: Spacing.four,
    marginBottom: Spacing.four,
    alignItems: 'center',
  },
  activeBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: Spacing.two,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Palette.accentLime,
  },
  activePillText: {
    color: Palette.accentLime,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  progressPercentText: {
    color: Palette.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  destinationTitle: {
    color: Palette.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginVertical: Spacing.two,
  },
  clockRing: {
    width: 200,
    height: 120,
    borderRadius: Radius.lg,
    backgroundColor: Palette.bgSecondary,
    borderWidth: 1,
    borderColor: 'rgba(212, 255, 58, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing.three,
  },
  clockDigits: {
    color: Palette.textPrimary,
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
  },
  clockSub: {
    color: Palette.accentLime,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 4,
  },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    marginBottom: Spacing.three,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Palette.accentLime,
    borderRadius: 3,
  },
  metaStrip: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingVertical: Spacing.two,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: Radius.md,
    marginBottom: Spacing.four,
  },
  metaItem: {
    alignItems: 'center',
  },
  metaDivider: {
    width: 1,
    height: '80%',
    backgroundColor: Palette.borderSubtle,
    alignSelf: 'center',
  },
  metaLabel: {
    color: Palette.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 2,
  },
  metaVal: {
    color: Palette.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  checkInBtn: {
    width: '100%',
    marginBottom: 10,
  },
  activeAuxRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  auxBtn: {
    flex: 1,
    minHeight: 42,
  },

  // Configuration Console
  configConsole: {
    gap: 12,
  },
  inputCard: {
    padding: Spacing.three,
  },
  configCardTitle: {
    color: Palette.accentLime,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  noteInput: {
    backgroundColor: Palette.bgSecondary,
    color: Palette.textPrimary,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Palette.borderSubtle,
  },
  presetSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  presetSectionTitle: {
    color: Palette.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  presetSectionMeta: {
    color: Palette.accentLime,
    fontSize: 11,
    fontWeight: '800',
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  presetCard: {
    width: '48.5%',
    backgroundColor: Palette.bgCard,
    borderRadius: Radius.md,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Palette.borderSubtle,
  },
  presetCardSelected: {
    borderColor: Palette.accentLime,
    backgroundColor: 'rgba(212, 255, 58, 0.08)',
  },
  presetTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  presetLabel: {
    color: Palette.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  presetLabelSelected: {
    color: Palette.accentLime,
  },
  presetDesc: {
    color: Palette.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  stepperCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
  },
  stepperTitle: {
    color: Palette.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  stepperSub: {
    color: Palette.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Palette.bgElevated,
    borderWidth: 1,
    borderColor: Palette.borderGlass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperNumber: {
    color: Palette.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    minWidth: 40,
    textAlign: 'center',
  },
  engageBtn: {
    marginTop: Spacing.two,
  },
});
