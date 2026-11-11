import AsyncStorage from '@react-native-async-storage/async-storage';
import { trackingIntervalMs, type JobStatus } from '@cerquita/shared';
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Seguimiento del profesional (regla 5): solo entre “Ir al domicilio” y “Terminado/Cancelado”.
 * El servidor rechaza puntos fuera de esos estados (RLS de job_tracks); si eso pasa, se detiene solo.
 * En el teléfono corre en segundo plano con notificación visible; en web, en primer plano.
 */
export const TRACKING_TASK = 'cerquita-tracking';
const JOB_KEY = 'cerquita:tracking-job';
const MODE_KEY = 'cerquita:tracking-mode';
/** Modo presencia: pro en línea sin servicio. Solo la última posición va al servidor (antifraude), sin historial. */
const PRESENCE = 'presence';

let webWatch: Location.LocationSubscription | null = null;
let pending: { latitude: number; longitude: number } | null = null;

async function send(jobId: string, latitude: number, longitude: number) {
  pending = { latitude, longitude };
  const { error } = await supabase
    .from('job_tracks')
    .insert({ job_id: jobId, point: `SRID=4326;POINT(${longitude} ${latitude})` });
  if (!error) {
    pending = null;
    return;
  }
  // 42501: el servicio ya no está en camino ni en el domicilio → se corta el envío.
  if (error.code === '42501') await stopTracking();
  // Sin señal: se guarda el último punto y se reintenta en el siguiente envío.
}

if (Platform.OS !== 'web') {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
    TRACKING_TASK,
    async ({ data, error }) => {
      if (error || !data?.locations?.length) return;
      const jobId = await AsyncStorage.getItem(JOB_KEY);
      const last = data.locations[data.locations.length - 1];
      if (jobId && last) await send(jobId, last.coords.latitude, last.coords.longitude);
    },
  );
}

async function batteryLevel(): Promise<number | null> {
  try {
    const level = await Battery.getBatteryLevelAsync();
    return level >= 0 ? level : null;
  } catch {
    return null;
  }
}

/** Pide permiso (primer plano obligatorio, segundo plano si lo dan) y empieza a enviar. */
export async function startTracking(
  jobId: string,
  status: JobStatus,
  distanceM: number | null = null,
): Promise<boolean> {
  const interval = trackingIntervalMs(status, distanceM, await batteryLevel());
  if (interval === null) {
    await stopTracking();
    return false;
  }
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;
  await AsyncStorage.setItem(JOB_KEY, jobId);
  await AsyncStorage.setItem(MODE_KEY, 'job');

  if (Platform.OS === 'web') {
    webWatch?.remove();
    webWatch = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: interval, distanceInterval: 0 },
      (pos) => send(jobId, pos.coords.latitude, pos.coords.longitude),
    );
    const now = await Location.getCurrentPositionAsync({});
    await send(jobId, now.coords.latitude, now.coords.longitude);
    return true;
  }

  const bg = await Location.requestBackgroundPermissionsAsync().catch(() => ({ status: 'denied' }));
  if (await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK)) {
    await Location.stopLocationUpdatesAsync(TRACKING_TASK);
  }
  await Location.startLocationUpdatesAsync(TRACKING_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: interval,
    distanceInterval: 10,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Cerquita está compartiendo tu ubicación',
      notificationBody: 'Solo con tu cliente, hasta que marques Terminado.',
      notificationColor: '#0E5A4B',
    },
  });
  if (bg.status !== 'granted' && pending === null) {
    const now = await Location.getCurrentPositionAsync({});
    await send(jobId, now.coords.latitude, now.coords.longitude);
  }
  return true;
}

export async function stopTracking(): Promise<void> {
  webWatch?.remove();
  webWatch = null;
  pending = null;
  await AsyncStorage.removeItem(JOB_KEY);
  if (
    Platform.OS !== 'web' &&
    (await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK).catch(() => false))
  ) {
    await Location.stopLocationUpdatesAsync(TRACKING_TASK);
  }
}

export async function hasLocationPermission(): Promise<boolean> {
  const { status } = await Location.getForegroundPermissionsAsync();
  return status === 'granted';
}

/**
 * Pro en línea sin servicio: comparte su última posición SOLO con el servidor cada ~2 min o 100 m
 * (ACCESS_BACKGROUND_LOCATION), para el reparto por radio y la detección de bypass. Se detiene al desconectarse.
 */
export async function startPresence(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if ((await AsyncStorage.getItem(MODE_KEY)) === 'job' && (await AsyncStorage.getItem(JOB_KEY)))
    return true; // ya hay un servicio
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;
  const bg = await Location.requestBackgroundPermissionsAsync().catch(() => ({ status: 'denied' }));
  if (bg.status !== 'granted') return false;
  await AsyncStorage.setItem(MODE_KEY, PRESENCE);
  if (await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK))
    await Location.stopLocationUpdatesAsync(TRACKING_TASK);
  await Location.startLocationUpdatesAsync(TRACKING_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 120000,
    distanceInterval: 100,
    pausesUpdatesAutomatically: true,
    foregroundService: {
      notificationTitle: 'Estás en línea en Cerquita',
      notificationBody: 'Recibes pedidos cerca. Desconéctate para dejar de compartir tu ubicación.',
      notificationColor: '#0E5A4B',
    },
  });
  return true;
}

export async function stopPresence(): Promise<void> {
  if ((await AsyncStorage.getItem(MODE_KEY)) !== PRESENCE) return;
  await AsyncStorage.removeItem(MODE_KEY);
  if (
    Platform.OS !== 'web' &&
    (await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK).catch(() => false))
  ) {
    await Location.stopLocationUpdatesAsync(TRACKING_TASK);
  }
}
