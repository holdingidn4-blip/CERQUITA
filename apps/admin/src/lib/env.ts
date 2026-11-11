const configured = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
/** Vistas previas detrás de un proxy: el navegador llama a Supabase por la misma dirección (p. ej. /sb). */
const proxyPath = process.env.NEXT_PUBLIC_SUPABASE_PROXY_PATH;

export const supabaseUrl =
  typeof window !== 'undefined' && proxyPath ? `${window.location.origin}${proxyPath}` : configured;
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
/** Nombre fijo de la cookie de sesión: el navegador y el servidor pueden ver URLs distintas de Supabase. */
export const authCookieName = 'sb-cerquita-auth-token';
