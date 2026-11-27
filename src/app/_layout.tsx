import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { ensureAuthenticatedUser } from '@/lib/firebase';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    // Proactively initialize persistent authentication session (anonymous or registered)
    void ensureAuthenticatedUser().catch(() => {});
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppTabs />
    </ThemeProvider>
  );
}
