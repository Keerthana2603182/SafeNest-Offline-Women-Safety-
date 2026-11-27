import React, { useState } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { GlassCard } from '@/components/ui/glass-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { TacticalButton } from '@/components/ui/tactical-button';
import { Palette, Radius, Spacing } from '@/constants/theme';

interface Protocol {
  id: string;
  code: string;
  title: string;
  category: 'threat' | 'transit' | 'defense' | 'medical';
  badge: string;
  badgeVariant: 'coral' | 'lime' | 'teal' | 'warning';
  summary: string;
  actionCallout: string;
  steps: {
    num: string;
    action: string;
    detail: string;
  }[];
  hotline?: {
    name: string;
    number: string;
  };
}

const PROTOCOLS: Protocol[] = [
  {
    id: 'stalker',
    code: 'SEC-01',
    title: 'Hostile Stalker & Follower Evasion',
    category: 'threat',
    badge: 'HIGH THREAT',
    badgeVariant: 'coral',
    summary: 'Tactical countermeasures when suspecting vehicular or pedestrian surveillance/tracking.',
    actionCallout: 'NEVER return home or enter dead-end alleys while pursued.',
    steps: [
      {
        num: '01',
        action: 'Confirm Observation Vector',
        detail: 'Make three deliberate right turns or cross the boulevard. If the individual matches maneuvers, hostile tracking is verified.',
      },
      {
        num: '02',
        action: 'Relocate to Crowded Hardened Node',
        detail: 'Seek high-visibility commercial sanctuaries: 24/7 pharmacies, hotel lobbies, transit stations, or gas stations.',
      },
      {
        num: '03',
        action: 'Arm SafeNest Silent Beacon',
        detail: 'Transmit your live telemetry stream link to your Safe Circle with one tap from the Command Center.',
      },
      {
        num: '04',
        action: 'Vocalize Perimeter Defense',
        detail: 'If cornered, shout firmly in a deep frequency: "STEP BACK — STAY AWAY!" Sound attracts witnesses and breaks predator calculus.',
      },
    ],
    hotline: {
      name: 'National Emergency Dispatch',
      number: '112',
    },
  },
  {
    id: 'rideshare',
    code: 'SEC-02',
    title: 'Rideshare & Transit Verification',
    category: 'transit',
    badge: 'TRANSIT',
    badgeVariant: 'teal',
    summary: 'Pre-boarding vehicle authentication protocol and active transit surveillance.',
    actionCallout: 'Always require the driver to state your name before entering.',
    steps: [
      {
        num: '01',
        action: 'Visual Registration Match',
        detail: 'Verify license plate characters, vehicle color, and driver face through the glass before touching door handles.',
      },
      {
        num: '02',
        action: 'Driver Name Challenge',
        detail: 'Ask "Who are you here for?" Never ask "Are you here for [Your Name]?" Force active verification.',
      },
      {
        num: '03',
        action: 'Child-Lock Inspection',
        detail: 'Check that rear door interior handles function freely immediately upon sitting in the passenger compartment.',
      },
      {
        num: '04',
        action: 'Arm Safe Arrival Sentinel',
        detail: 'Set SafeNest arrival timer to expected ride duration + 5 minutes. If overdue, auto-escalation notifies contacts.',
      },
    ],
  },
  {
    id: 'defense',
    code: 'SEC-03',
    title: 'Close-Quarters Self Defense',
    category: 'defense',
    badge: 'SURVIVAL',
    badgeVariant: 'warning',
    summary: 'Physical boundary preservation and anatomical vulnerability targeting under immediate duress.',
    actionCallout: 'Your singular objective is escape, not engagement.',
    steps: [
      {
        num: '01',
        action: 'Establish Reactionary Distance',
        detail: 'Maintain at least 6 feet of clearance. Raise open palms to chest level in an assertive non-escalation stance.',
      },
      {
        num: '02',
        action: 'High-Impact Target Areas',
        detail: 'If physically seized, deliver decisive force to soft anatomical targets: Eyes, windpipe, groin, or downward heel stomp on instep.',
      },
      {
        num: '03',
        action: 'Deploy Audible Siren',
        detail: 'Trigger the SafeNest command center siren to project high-decibel disorientation sound waves.',
      },
      {
        num: '04',
        action: 'Shout "FIRE" Over "HELP"',
        detail: 'Psychological emergency studies confirm shouts of "FIRE" yield 300% faster bystander engagement than generic cries.',
      },
    ],
  },
  {
    id: 'medical',
    code: 'SEC-04',
    title: 'Trauma & Emergency First Response',
    category: 'medical',
    badge: 'FIRST AID',
    badgeVariant: 'lime',
    summary: 'Immediate field triage protocols for severe hemorrhage, syncope, and respiratory compromise.',
    actionCallout: 'Direct firm pressure controls over 80% of severe bleeding.',
    steps: [
      {
        num: '01',
        action: 'Arterial Bleeding Control',
        detail: 'Apply relentless direct pressure using clean fabric or tourniquet 2-3 inches above injury (avoiding joints).',
      },
      {
        num: '02',
        action: 'Airway Recovery Positioning',
        detail: 'For unconscious breathing individuals, roll onto their left side with top knee bent to keep airway patent.',
      },
      {
        num: '03',
        action: 'Transmit GPS Coordinates',
        detail: 'Read SafeNest latitude & longitude digits aloud to emergency medical dispatch for sub-meter ambulance routing.',
      },
    ],
    hotline: {
      name: 'Ambulance Triage Relay',
      number: '108',
    },
  },
];

type CategoryFilter = 'all' | 'threat' | 'transit' | 'defense' | 'medical';

export default function ExploreScreen() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>('stalker');

  const filteredProtocols = PROTOCOLS.filter((p) => {
    if (selectedCategory === 'all') return true;
    return p.category === selectedCategory;
  });

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handleCallHotline(number: string) {
    Linking.openURL(`tel:${number}`);
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Top Header */}
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

        <StatusBadge label="OFFLINE CACHED" variant="lime" pulse />
      </View>

      {/* Editorial Title */}
      <View style={styles.titleSection}>
        <Text style={styles.categoryLabel}>OPERATIONAL DOCTRINE</Text>
        <Text style={styles.headline}>Safety Protocols</Text>
        <Text style={styles.subtitle}>
          Tactical field manuals, evasion procedures, and physiological crisis responses developed for high-stress scenarios.
        </Text>
      </View>

      {/* Quick SOS Drill Banner */}
      <GlassCard variant="active" style={styles.drillBanner}>
        <View style={styles.drillBannerContent}>
          <View style={styles.drillIconWrapper}>
            <Ionicons name="timer-outline" size={24} color={Palette.accentLime} />
          </View>
          <View style={styles.drillTextWrapper}>
            <Text style={styles.drillTitle}>Safe Arrival Sentinel</Text>
            <Text style={styles.drillSubtitle}>Traveling solo tonight? Arm your automated countdown check-in.</Text>
          </View>
        </View>
        <TacticalButton
          label="ARM SENTINEL"
          variant="primary"
          onPress={() => router.push('/timer')}
          style={styles.drillButton}
        />
      </GlassCard>

      {/* Filter Category Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterBar}
      >
        <TouchableOpacity
          style={[styles.filterChip, selectedCategory === 'all' && styles.filterChipActive]}
          onPress={() => setSelectedCategory('all')}
        >
          <Text style={[styles.filterChipText, selectedCategory === 'all' && styles.filterChipTextActive]}>
            ALL DIRECTIVES
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, selectedCategory === 'threat' && styles.filterChipActive]}
          onPress={() => setSelectedCategory('threat')}
        >
          <Text style={[styles.filterChipText, selectedCategory === 'threat' && styles.filterChipTextActive]}>
            STALKER & THREAT
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, selectedCategory === 'transit' && styles.filterChipActive]}
          onPress={() => setSelectedCategory('transit')}
        >
          <Text style={[styles.filterChipText, selectedCategory === 'transit' && styles.filterChipTextActive]}>
            RIDESHARE
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, selectedCategory === 'defense' && styles.filterChipActive]}
          onPress={() => setSelectedCategory('defense')}
        >
          <Text style={[styles.filterChipText, selectedCategory === 'defense' && styles.filterChipTextActive]}>
            SELF-DEFENSE
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, selectedCategory === 'medical' && styles.filterChipActive]}
          onPress={() => setSelectedCategory('medical')}
        >
          <Text style={[styles.filterChipText, selectedCategory === 'medical' && styles.filterChipTextActive]}>
            FIRST AID
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Protocols List */}
      <View style={styles.protocolsList}>
        {filteredProtocols.map((protocol) => {
          const isExpanded = expandedId === protocol.id;

          return (
            <GlassCard
              key={protocol.id}
              variant={isExpanded ? 'elevated' : 'default'}
              style={styles.protocolCard}
            >
              <TouchableOpacity
                onPress={() => toggleExpand(protocol.id)}
                activeOpacity={0.8}
                style={styles.protocolHeader}
              >
                <View style={styles.protocolTopRow}>
                  <Text style={styles.protocolCode}>{protocol.code}</Text>
                  <StatusBadge
                    label={protocol.badge}
                    variant={protocol.badgeVariant}
                  />
                </View>

                <Text style={styles.protocolTitle}>{protocol.title}</Text>
                <Text style={styles.protocolSummary}>{protocol.summary}</Text>

                <View style={styles.expandRow}>
                  <Text style={styles.expandActionText}>
                    {isExpanded ? 'COLLAPSE DIRECTIVE' : 'VIEW TACTICAL STEPS'}
                  </Text>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={Palette.accentLime}
                  />
                </View>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.expandedContent}>
                  <View style={styles.calloutCard}>
                    <Ionicons name="warning-outline" size={16} color={Palette.accentCoral} />
                    <Text style={styles.calloutText}>{protocol.actionCallout}</Text>
                  </View>

                  <View style={styles.stepsContainer}>
                    {protocol.steps.map((step) => (
                      <View key={step.num} style={styles.stepItem}>
                        <View style={styles.stepBadge}>
                          <Text style={styles.stepNumber}>{step.num}</Text>
                        </View>
                        <View style={styles.stepBody}>
                          <Text style={styles.stepAction}>{step.action}</Text>
                          <Text style={styles.stepDetail}>{step.detail}</Text>
                        </View>
                      </View>
                    ))}
                  </View>

                  {protocol.hotline && (
                    <TouchableOpacity
                      style={styles.hotlineButton}
                      onPress={() => handleCallHotline(protocol.hotline!.number)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="call" size={16} color={Palette.accentLime} />
                      <Text style={styles.hotlineText}>
                        DISPATCH {protocol.hotline.name.toUpperCase()} ({protocol.hotline.number})
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </GlassCard>
          );
        })}
      </View>

      {/* Emergency Hotlines Matrix */}
      <GlassCard variant="default" style={styles.hotlinesCard}>
        <View style={styles.hotlinesHeader}>
          <Ionicons name="shield-checkmark" size={18} color={Palette.accentLime} />
          <Text style={styles.hotlinesTitle}>NATIONAL DISPATCH CHANNELS</Text>
        </View>
        <Text style={styles.hotlinesSubtitle}>
          Direct emergency line telephonic connection. Bypasses cellular data networks.
        </Text>

        <View style={styles.hotlineGrid}>
          <TouchableOpacity
            style={styles.hotlineTile}
            onPress={() => handleCallHotline('112')}
          >
            <Text style={styles.hotlineDial}>112</Text>
            <Text style={styles.hotlineDesc}>National SOS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.hotlineTile}
            onPress={() => handleCallHotline('1091')}
          >
            <Text style={styles.hotlineDial}>1091</Text>
            <Text style={styles.hotlineDesc}>Women Helpline</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.hotlineTile}
            onPress={() => handleCallHotline('108')}
          >
            <Text style={styles.hotlineDial}>108</Text>
            <Text style={styles.hotlineDesc}>Ambulance</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.hotlineTile}
            onPress={() => handleCallHotline('181')}
          >
            <Text style={styles.hotlineDial}>181</Text>
            <Text style={styles.hotlineDesc}>Domestic Distress</Text>
          </TouchableOpacity>
        </View>
      </GlassCard>

      {/* Footer Info */}
      <View style={styles.footer}>
        <Text style={styles.footerNote}>
          ALL PROTOCOLS PERSISTED LOCALLY • ZERO NETWORK DEPENDENCY FOR CACHED DATA
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.bgPrimary,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: 54,
    paddingBottom: Spacing.six,
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
    marginBottom: Spacing.four,
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
  drillBanner: {
    marginBottom: Spacing.four,
    padding: Spacing.three,
  },
  drillBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  drillIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Palette.accentLimeSoft,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212, 255, 58, 0.3)',
  },
  drillTextWrapper: {
    flex: 1,
  },
  drillTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Palette.textPrimary,
    marginBottom: 2,
  },
  drillSubtitle: {
    fontSize: 12,
    color: Palette.textSecondary,
    lineHeight: 16,
  },
  drillButton: {
    height: 44,
  },
  filterBar: {
    gap: 8,
    paddingBottom: Spacing.four,
  },
  filterChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: Radius.full,
    backgroundColor: Palette.bgCard,
    borderWidth: 1,
    borderColor: Palette.borderSubtle,
  },
  filterChipActive: {
    backgroundColor: Palette.accentLimeSoft,
    borderColor: Palette.accentLime,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: Palette.textSecondary,
    letterSpacing: 0.6,
  },
  filterChipTextActive: {
    color: Palette.accentLime,
  },
  protocolsList: {
    gap: Spacing.four,
    marginBottom: Spacing.five,
  },
  protocolCard: {
    padding: Spacing.four,
  },
  protocolHeader: {
    gap: 6,
  },
  protocolTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  protocolCode: {
    fontSize: 11,
    fontWeight: '800',
    color: Palette.accentTeal,
    letterSpacing: 1.2,
  },
  protocolTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Palette.textPrimary,
  },
  protocolSummary: {
    fontSize: 13,
    color: Palette.textSecondary,
    lineHeight: 18,
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Palette.borderSubtle,
  },
  expandActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: Palette.accentLime,
    letterSpacing: 0.8,
  },
  expandedContent: {
    marginTop: Spacing.three,
    gap: Spacing.three,
  },
  calloutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
  },
  calloutText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: Palette.accentCoral,
  },
  stepsContainer: {
    gap: 12,
  },
  stepItem: {
    flexDirection: 'row',
    gap: 12,
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Palette.bgElevated,
    borderWidth: 1,
    borderColor: Palette.borderGlass,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  stepNumber: {
    fontSize: 11,
    fontWeight: '800',
    color: Palette.accentLime,
  },
  stepBody: {
    flex: 1,
    gap: 2,
  },
  stepAction: {
    fontSize: 13,
    fontWeight: '700',
    color: Palette.textPrimary,
  },
  stepDetail: {
    fontSize: 12,
    color: Palette.textSecondary,
    lineHeight: 17,
  },
  hotlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    backgroundColor: Palette.bgElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Palette.borderHighlight,
    marginTop: 4,
  },
  hotlineText: {
    fontSize: 11,
    fontWeight: '800',
    color: Palette.accentLime,
    letterSpacing: 0.8,
  },
  hotlinesCard: {
    padding: Spacing.four,
    marginBottom: Spacing.four,
  },
  hotlinesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  hotlinesTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Palette.textPrimary,
    letterSpacing: 1.2,
  },
  hotlinesSubtitle: {
    fontSize: 12,
    color: Palette.textSecondary,
    marginBottom: Spacing.three,
  },
  hotlineGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hotlineTile: {
    flexBasis: '48%',
    flexGrow: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: Palette.bgPrimary,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Palette.borderSubtle,
    alignItems: 'center',
  },
  hotlineDial: {
    fontSize: 18,
    fontWeight: '800',
    color: Palette.accentLime,
    marginBottom: 2,
  },
  hotlineDesc: {
    fontSize: 11,
    color: Palette.textSecondary,
    fontWeight: '600',
  },
  footer: {
    marginTop: Spacing.four,
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
