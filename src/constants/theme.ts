/**
 * SafeNest Design System
 * Deep Graphite, Soft Ivory, Muted Silver, Electric Lime & Icy Teal
 * Coral exclusively for Emergency / SOS
 */

import '@/global.css';
import { Platform } from 'react-native';

export const Palette = {
  // Deep Graphite & Charcoal Base
  bgPrimary: '#0A0C10',
  bgSecondary: '#12151D',
  bgSurface: '#181C26',
  bgElevated: '#212735',
  bgCard: 'rgba(24, 28, 38, 0.88)',
  bgGlass: 'rgba(18, 21, 29, 0.78)',
  bgGlassLight: 'rgba(255, 255, 255, 0.04)',

  // Soft Ivory & Warm Off-White
  textPrimary: '#F6F6F4',
  textSecondary: '#A2A7B5',
  textMuted: '#646A7B',

  // Electric Lime (Tactical / Futuristic Accent)
  accentLime: '#D4FF3A',
  accentLimeDark: '#A3CA1A',
  accentLimeSoft: 'rgba(212, 255, 58, 0.12)',
  accentLimeGlow: 'rgba(212, 255, 58, 0.28)',

  // Icy Teal (Live Satellite / Telemetry Pulse)
  accentTeal: '#00F2FE',
  accentTealDark: '#4EECD4',
  accentTealSoft: 'rgba(0, 242, 254, 0.12)',
  accentTealGlow: 'rgba(78, 236, 212, 0.25)',

  // Coral / Red (Emergency SOS Exclusively)
  accentCoral: '#FF3B30',
  accentCoralDark: '#D62828',
  accentCoralSoft: 'rgba(255, 59, 48, 0.16)',
  accentCoralGlow: 'rgba(255, 59, 48, 0.45)',

  // Borders & Micro-Details
  borderSubtle: 'rgba(255, 255, 255, 0.07)',
  borderGlass: 'rgba(255, 255, 255, 0.13)',
  borderHighlight: 'rgba(212, 255, 58, 0.35)',
  borderCoral: 'rgba(255, 59, 48, 0.40)',

  // Status Indicators
  online: '#4EECD4',
  offline: '#EAB308',
  error: '#FF3B30',
  success: '#4ADE80',
};

export const Colors = {
  light: {
    text: Palette.textPrimary,
    background: Palette.bgPrimary,
    backgroundElement: Palette.bgSecondary,
    backgroundSelected: Palette.bgSurface,
    textSecondary: Palette.textSecondary,
  },
  dark: {
    text: Palette.textPrimary,
    background: Palette.bgPrimary,
    backgroundElement: Palette.bgSecondary,
    backgroundSelected: Palette.bgSurface,
    textSecondary: Palette.textSecondary,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
    serif: 'var(--font-serif, Georgia, serif)',
    rounded: 'var(--font-rounded, sans-serif)',
    mono: 'var(--font-mono, monospace)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  full: 9999,
} as const;

export const DarkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#0F1219' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0A0C10' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#A2A7B5' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#D4FF3A' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#4EECD4' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#141822' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1D2230' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#12151D' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#7E8597' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#262D3E' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#161B26' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#07090D' }] },
];

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;