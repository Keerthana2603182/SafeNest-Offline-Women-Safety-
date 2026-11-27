import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { ensureAuthenticatedUser } from '@/lib/firebase';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    // Proactively initialize persistent authentication session (anonymous or registered)
    void ensureAuthenticatedUser().catch(() => {});
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#100D20' },
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