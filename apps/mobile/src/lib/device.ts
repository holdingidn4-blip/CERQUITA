import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

const WEB_KEY = 'cerquita.device-id';

/**
 * Identificador del dispositivo para la lista negra. El servidor solo guarda su hash.
 * Android: Android ID (se mantiene al reinstalar). iOS: id del proveedor. Web: uno aleatorio guardado.
 */
async function deviceId(): Promise<string | null> {
  if (Platform.OS === 'android') return `android:${Application.getAndroidId()}`;
  if (Platform.OS === 'ios') {
    const id = await Application.getIosIdForVendorAsync();
    return id ? `ios:${id}` : null;
  }
  const saved = await AsyncStorage.getItem(WEB_KEY);
  if (saved) return saved;
  const fresh = `web:${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  await AsyncStorage.setItem(WEB_KEY, fresh);
  return fresh;
}

let registeredFor: string | null = null;

/** Registra el dispositivo una vez por sesión de usuario (sin bloquear la app si falla). */
export async function registerDevice(userId: string): Promise<void> {
  if (registeredFor === userId) return;
  registeredFor = userId;
  try {
    const id = await deviceId();
    if (id) await supabase.rpc('register_device', { p_device: id });
  } catch {
    registeredFor = null;
  }
}
