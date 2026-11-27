import React from 'react';
import { StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { Palette, Radius, Spacing } from '@/constants/theme';

interface GlassCardProps extends ViewProps {
  variant?: 'default' | 'elevated' | 'active' | 'danger';
  style?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
}

export function GlassCard({ variant = 'default', style, children, ...rest }: GlassCardProps) {
  const variantStyles = {
    default: styles.default,
    elevated: styles.elevated,
    active: styles.active,
    danger: styles.danger,
  }[variant];

  return (
    <View style={[styles.base, variantStyles, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.lg,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Palette.borderSubtle,
    backgroundColor: Palette.bgCard,
    overflow: 'hidden',
  },
  default: {
    backgroundColor: Palette.bgCard,
    borderColor: Palette.borderSubtle,
  },
  elevated: {
    backgroundColor: Palette.bgElevated,
    borderColor: Palette.borderGlass,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
  active: {
    backgroundColor: 'rgba(212, 255, 58, 0.05)',
    borderColor: Palette.borderHighlight,
  },
  danger: {
    backgroundColor: 'rgba(255, 59, 48, 0.08)',
    borderColor: Palette.borderCoral,
  },
});