/**
 * Variables públicas de la app. Expo solo expone al cliente las que empiezan con EXPO_PUBLIC_.
 * Nunca pongas aquí la service role key de Supabase.
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
} as const;

export const isSupabaseConfigured = env.supabaseUrl !== '' && env.supabaseAnonKey !== '';

/** URLs legales por entorno. TODO(decidir): URLs definitivas (sin ellas se usan las de ejemplo). */
export const legalUrls = {
  terms: process.env.EXPO_PUBLIC_TERMS_URL || 'https://example.com/terminos',
  privacy: process.env.EXPO_PUBLIC_PRIVACY_URL || 'https://example.com/privacidad',
  personalData: process.env.EXPO_PUBLIC_PERSONAL_DATA_URL || 'https://example.com/datos',
} as const;
