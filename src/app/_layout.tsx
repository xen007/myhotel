import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '@/context/auth-context';
import { VisitCartProvider } from '@/context/visit-cart';
import { Palette } from '@/constants/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  return (
    <AuthProvider>
      <VisitCartProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'fade',
            contentStyle: { backgroundColor: Palette.ink },
          }}
        />
      </VisitCartProvider>
    </AuthProvider>
  );
}
