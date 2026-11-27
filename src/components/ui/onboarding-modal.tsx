import React, { useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { TacticalButton } from './tactical-button';

const STORAGE_KEY = 'safenest_onboarding_completed_v2';

const SLIDES = [
  {
    step: '01',
    badge: 'RAPID PROTOCOL',
    title: 'Autonomous\nEmergency Response',
    description: 'Instant 5-second countdown with silent haptic feedback. Dispatches live satellite telemetry to your safe circle before danger escalates.',
    icon: 'shield-checkmark',
    color: Palette.accentLime,
  },
  {
    step: '02',
    badge: 'ZERO-INSTALL PORTAL',
    title: 'Live Satellite\nMesh Tracking',
    description: 'Your trusted contacts stream your live GPS path directly inside any web browser or device. Unguessable bearer access ensures total privacy.',
    icon: 'navigate',
    color: Palette.accentTeal,
  },
  {
    step: '03',
    badge: 'JOURNEY SENTINEL',
    title: 'Safe Arrival\nWatch System',
    description: 'Heading out after dark or commuting alone? Set an arrival timer. If you don’t check in, SafeNest initiates immediate emergency escalation.',
    icon: 'timer',
    color: Palette.accentLime,
  },
];

export function OnboardingModal() {
  const [visible, setVisible] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    async function checkStatus() {
      try {
        const completed = await AsyncStorage.getItem(STORAGE_KEY);
        if (!completed) {
          setVisible(true);
        }
      } catch {
        // Fallback
      }
    }
    checkStatus();
  }, []);

  async function handleDismiss() {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // Quiet
    }
    // Proactively request foreground location permission
    try {
      await Location.requestForegroundPermissionsAsync();
    } catch {
      // Quiet
    }
    setVisible(false);
  }

  function handleNext() {
    if (slideIndex < SLIDES.length - 1) {
      setSlideIndex(slideIndex + 1);
    } else {
      handleDismiss();
    }
  }

  if (!visible) return null;

  const current = SLIDES[slideIndex];

  return (
    <Modal visible={visible} animationType="fade" transparent={true}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.topRow}>
            <View style={styles.brandRow}>
              <View style={styles.brandDot} />
              <Text style={styles.brandName}>SAFENEST</Text>
            </View>
            <TouchableOpacity onPress={handleDismiss} style={styles.skipBtn}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>

          {/* Icon Orb */}
          <View style={[styles.iconOrb, { borderColor: current.color + '40', backgroundColor: current.color + '15' }]}>
            <Ionicons name={current.icon as any} size={40} color={current.color} />
          </View>

          {/* Badge & Step */}
          <View style={styles.metaRow}>
            <Text style={[styles.badgeText, { color: current.color }]}>{current.badge}</Text>
            <Text style={styles.stepText}>{current.step} / 03</Text>
          </View>

          {/* Titles */}
          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.description}>{current.description}</Text>

          {/* Pagination & Next */}
          <View style={styles.bottomRow}>
            <View style={styles.dotsRow}>
              {SLIDES.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === slideIndex ? [styles.dotActive, { backgroundColor: current.color }] : styles.dotInactive,
                  ]}
                />
              ))}
            </View>

            <TacticalButton
              label={slideIndex === SLIDES.length - 1 ? 'Enter SafeNest' : 'Next'}
              onPress={handleNext}
              variant={slideIndex === SLIDES.length - 1 ? 'primary' : 'secondary'}
              style={styles.actionBtn}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 10, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Palette.bgCard,
    borderRadius: Radius.xl,
    padding: Spacing.four,
    borderWidth: 1,
    borderColor: Palette.borderGlass,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.four,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Palette.accentLime,
  },
  brandName: {
    color: Palette.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
  },
  skipBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  skipText: {
    color: Palette.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  iconOrb: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.four,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  stepText: {
    color: Palette.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    color: Palette.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 32,
    marginBottom: Spacing.two,
  },
  description: {
    color: Palette.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: Spacing.five,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    height: 5,
    borderRadius: 3,
  },
  dotActive: {
    width: 22,
  },
  dotInactive: {
    width: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  actionBtn: {
    minWidth: 140,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
});