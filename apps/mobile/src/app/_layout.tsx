import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/auth/auth-provider';
import { withMonitoring } from '@/lib/monitoring';
import { listenToNotificationTaps, registerForPush } from '@/lib/notifications';
// Registra la tarea de ubicación en segundo plano al arrancar (expo-task-manager lo exige).
import '@/service/tracking';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

function Navigator() {
  const { loading, session } = useAuth();
  const userId = session?.user.id;

  // Push: registra el token al iniciar sesión y abre la pantalla de la notificación al tocarla.
  useEffect(() => {
    if (userId) registerForPush().catch(() => undefined);
  }, [userId]);
  useEffect(() => listenToNotificationTaps(), []);
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });
  const ready = (fontsLoaded || fontError) && !loading;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      />
    </>
  );
}

function RootLayout() {
  return (
    <AuthProvider>
      <Navigator />
    </AuthProvider>
  );
}

export default withMonitoring(RootLayout);
