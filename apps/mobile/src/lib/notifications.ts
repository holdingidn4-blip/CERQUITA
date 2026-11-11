import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// Se muestran también con la app abierta.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Pide permiso, obtiene el token de Expo y lo guarda en push_tokens.
 * Requiere un dispositivo real y el projectId de EAS (app.config.ts). En web o sin projectId no hace nada.
 */
export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  if (!projectId) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Cerquita',
      importance: AndroidImportance.HIGH,
      lightColor: '#0E5A4B',
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const status = current.granted
    ? 'granted'
    : (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
  return token;
}

/** Al tocar una notificación, abre la pantalla de su `data.url`. */
export function listenToNotificationTaps(): () => void {
  if (Platform.OS === 'web') return () => undefined;
  const open = (url: unknown) => {
    if (typeof url === 'string' && url.startsWith('/')) router.push(url as Href);
  };
  Notifications.getLastNotificationResponseAsync().then((r) =>
    open(r?.notification.request.content.data?.url),
  );
  const sub = Notifications.addNotificationResponseReceivedListener((r) =>
    open(r.notification.request.content.data?.url),
  );
  return () => sub.remove();
}
