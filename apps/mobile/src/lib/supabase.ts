import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from '@cerquita/shared';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { env } from '@/lib/env';

/**
 * Sin internet, fetch falla con un error técnico en inglés ("TypeError: Failed to fetch"). Lo cambiamos por uno
 * en español; supabase-js lo muestra como "Sin conexión: revisa tu internet e intenta de nuevo.".
 */
async function fetchWithFriendlyErrors(input: RequestInfo | URL, init?: RequestInit) {
  try {
    return await fetch(input, init);
  } catch (e) {
    if (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')) throw e;
    const offline = new Error('revisa tu internet e intenta de nuevo.');
    offline.name = 'Sin conexión';
    throw offline;
  }
}

export const supabase = createClient<Database>(
  env.supabaseUrl || 'http://127.0.0.1:54321',
  env.supabaseAnonKey || 'sin-configurar',
  {
    global: { fetch: fetchWithFriendlyErrors },
    auth: {
      // En web estático (export) no hay window durante el prerender.
      ...(Platform.OS !== 'web' || typeof window !== 'undefined' ? { storage: AsyncStorage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Refresca el token solo mientras la app está en primer plano.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Mensaje para el usuario: si no hay internet lo dice; si no, usa el texto propio de la pantalla. */
export function friendlyError(error: { message?: string } | null, fallback: string): string {
  return error?.message?.startsWith('Sin conexión') ? error.message : fallback;
}

/** Mensajes de error de Supabase Auth en español. */
export function authErrorMessage(error: { code?: string; message?: string } | null): string {
  switch (error?.code) {
    case 'otp_expired':
      return 'El código venció o no es correcto. Pide uno nuevo.';
    case 'over_sms_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Pediste muchos códigos. Espera un momento e intenta de nuevo.';
    case 'sms_send_failed':
      return 'No pudimos enviar el SMS. Revisa el número e intenta otra vez.';
    case 'phone_provider_disabled':
      return 'El ingreso por SMS no está disponible ahora.';
    default:
      return 'Algo salió mal. Revisa tu conexión e intenta de nuevo.';
  }
}
