import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';

import { Palette } from '@/constants/theme';
import { ensureAuthenticatedUser } from '@/lib/firebase';

const CustomDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Palette.bgPrimary,
    card: Palette.bgSecondary,
    text: Palette.textPrimary,
    border: Palette.borderSubtle,
    primary: Palette.accentLime,
  },
};

export default function RootLayout() {
  useEffect(() => {
    // Proactively initialize persistent authentication session (anonymous or registered)
    void ensureAuthenticatedUser().catch(() => {});
  }, []);

  return (
    <ThemeProvider value={CustomDarkTheme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Palette.bgPrimary },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="timer" options={{ headerShown: false }} />
        <Stack.Screen name="track" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}