import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { GuideBot } from '@/components/guide/guide-bot';
import { AuthProvider } from '@/context/auth-context';
import { VisitCartProvider } from '@/context/visit-cart';
import { Palette } from '@/constants/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  return (
    <AuthProvider>
      <VisitCartProvider>
        <View style={{ flex: 1 }}>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'fade',
              contentStyle: { backgroundColor: Palette.ink },
            }}
          />
          <GuideBot />
        </View>
      </VisitCartProvider>
    </AuthProvider>
  );
}
