import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Palette, Radius } from '@/constants/theme';

interface StatusBadgeProps {
  label: string;
  variant?: 'teal' | 'lime' | 'coral' | 'neutral' | 'warning';
  pulse?: boolean;
  style?: ViewStyle;
}

export function StatusBadge({ label, variant = 'teal', pulse = false, style }: StatusBadgeProps) {
  const colorMap = {
    teal: { text: Palette.accentTeal, bg: Palette.accentTealSoft, border: 'rgba(0, 242, 254, 0.25)', dot: Palette.accentTeal },
    lime: { text: Palette.accentLime, bg: Palette.accentLimeSoft, border: 'rgba(212, 255, 58, 0.25)', dot: Palette.accentLime },
    coral: { text: Palette.accentCoral, bg: Palette.accentCoralSoft, border: Palette.borderCoral, dot: Palette.accentCoral },
    neutral: { text: Palette.textSecondary, bg: 'rgba(255, 255, 255, 0.05)', border: Palette.borderSubtle, dot: Palette.textSecondary },
    warning: { text: '#FBBF24', bg: 'rgba(251, 191, 36, 0.12)', border: 'rgba(251, 191, 36, 0.3)', dot: '#FBBF24' },
  }[variant];

  return (
    <View style={[styles.badge, { backgroundColor: colorMap.bg, borderColor: colorMap.border }, style]}>
      <View style={[styles.dot, { backgroundColor: colorMap.dot }]} />
      <Text style={[styles.text, { color: colorMap.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: Radius.full,
    borderWidth: 1,
    gap: 6,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});