import React from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableOpacityProps,
  Vibration,
  ViewStyle,
} from 'react-native';
import { Palette, Radius } from '@/constants/theme';

interface TacticalButtonProps extends TouchableOpacityProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'coral' | 'ghost' | 'glass';
  icon?: React.ReactNode;
  loading?: boolean;
  haptic?: boolean;
  style?: ViewStyle | ViewStyle[];
}

export function TacticalButton({
  label,
  variant = 'primary',
  icon,
  loading = false,
  haptic = true,
  disabled,
  style,
  onPress,
  ...rest
}: TacticalButtonProps) {
  function handlePress(e: any) {
    if (disabled || loading) return;
    if (haptic && Platform.OS !== 'web') {
      try {
        Vibration.vibrate(30);
      } catch {
        // Fallback
      }
    }
    onPress?.(e);
  }

  const variantStyles = {
    primary: styles.primary,
    secondary: styles.secondary,
    coral: styles.coral,
    ghost: styles.ghost,
    glass: styles.glass,
  }[variant];

  const textVariantStyles = {
    primary: styles.textPrimary,
    secondary: styles.textSecondary,
    coral: styles.textCoral,
    ghost: styles.textGhost,
    glass: styles.textGlass,
  }[variant];

  return (
    <TouchableOpacity
      style={[styles.base, variantStyles, (disabled || loading) && styles.disabled, style]}
      activeOpacity={0.82}
      onPress={handlePress}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#0A0C10' : Palette.textPrimary} size="small" />
      ) : (
        <>
          {icon}
          <Text style={[styles.textBase, textVariantStyles]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: Radius.md,
    minHeight: 50,
    gap: 8,
  },
  primary: {
    backgroundColor: Palette.accentLime,
    shadowColor: Palette.accentLime,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 3,
  },
  secondary: {
    backgroundColor: Palette.bgElevated,
    borderWidth: 1,
    borderColor: Palette.borderGlass,
  },
  coral: {
    backgroundColor: Palette.accentCoral,
    shadowColor: Palette.accentCoral,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 3,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  glass: {
    backgroundColor: Palette.bgGlass,
    borderWidth: 1,
    borderColor: Palette.borderGlass,
  },
  disabled: {
    opacity: 0.5,
  },
  textBase: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  textPrimary: {
    color: '#0A0C10',
  },
  textSecondary: {
    color: Palette.textPrimary,
  },
  textCoral: {
    color: '#FFFFFF',
  },
  textGhost: {
    color: Palette.textSecondary,
  },
  textGlass: {
    color: Palette.textPrimary,
  },
});