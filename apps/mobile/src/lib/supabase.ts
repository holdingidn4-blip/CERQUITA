import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from '@cerquita/shared';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { env } from '@/lib/env';

export const supabase = createClient<Database>(
  env.supabaseUrl || 'http://127.0.0.1:54321',
  env.supabaseAnonKey || 'sin-configurar',
  {
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
