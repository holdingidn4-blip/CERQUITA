import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { supabaseUrl } from '@/lib/env';

/**
 * Cliente con service role. SOLO en el servidor y SOLO para firmar URLs de documentos
 * después de registrar la vista con log_document_access() (regla 6).
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY');
  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
