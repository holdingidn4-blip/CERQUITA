/**
 * Variables públicas de la app. Expo solo expone al cliente las que empiezan con EXPO_PUBLIC_.
 * Nunca pongas aquí la service role key de Supabase.
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
} as const;

export const isSupabaseConfigured = env.supabaseUrl !== '' && env.supabaseAnonKey !== '';

/** TODO(decidir): URLs definitivas de términos y privacidad (hoy son de ejemplo). */
export const legalUrls = {
  terms: 'https://example.com/terminos',
  privacy: 'https://example.com/privacidad',
  personalData: 'https://example.com/datos',
} as const;
