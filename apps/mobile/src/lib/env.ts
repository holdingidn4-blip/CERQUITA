/**
 * Variables públicas de la app. Expo solo expone al cliente las que empiezan con EXPO_PUBLIC_.
 * Nunca pongas aquí la service role key de Supabase.
 */
const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

export const env = {
  // "same-origin": vistas previas web detrás de un proxy que reenvía /sb a Supabase.
  supabaseUrl:
    configuredUrl === 'same-origin'
      ? typeof window !== 'undefined'
        ? `${window.location.origin}/sb`
        : 'http://127.0.0.1:54321'
      : configuredUrl,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
} as const;

export const isSupabaseConfigured = env.supabaseUrl !== '' && env.supabaseAnonKey !== '';

/** URLs legales por entorno. TODO(decidir): URLs definitivas (sin ellas se usan las de ejemplo). */
export const legalUrls = {
  terms: process.env.EXPO_PUBLIC_TERMS_URL || 'https://example.com/terminos',
  privacy: process.env.EXPO_PUBLIC_PRIVACY_URL || 'https://example.com/privacidad',
  personalData: process.env.EXPO_PUBLIC_PERSONAL_DATA_URL || 'https://example.com/datos',
} as const;
