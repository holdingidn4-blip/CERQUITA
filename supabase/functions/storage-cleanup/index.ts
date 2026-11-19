// Edge Function: borra de Storage los archivos huérfanos (public.storage_orphans: subidas a medias,
// archivos de cuentas eliminadas y videos temporales vencidos). Nunca toca app-releases.
// La invoca pg_cron cada hora (private.dispatch_storage_cleanup) con el secreto de Vault
// “push_function_secret”, así la llave service_role no sale de Supabase.
// Solo borra si settings.storage_cleanup_enabled = 1; si no, cuenta los huérfanos (modo prueba).
// Deploy: supabase functions deploy storage-cleanup --no-verify-jwt
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { cleanupBatches, type Orphan } from '../_shared/cleanup.ts';

/** El llamado debe traer el secreto de Vault (o PUSH_FUNCTION_SECRET si está configurado). */
async function authorized(req: Request, supabase: SupabaseClient): Promise<boolean> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token.length < 32) return false;
  const envSecret = Deno.env.get('PUSH_FUNCTION_SECRET');
  if (envSecret) return token === envSecret;
  const { data } = await supabase.rpc('push_secret_matches', { p_secret: token });
  return data === true;
}

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  if (!(await authorized(req, supabase))) {
    return new Response('No autorizado', { status: 401 });
  }

  const [orphans, flag] = await Promise.all([
    supabase.rpc('storage_orphans'),
    supabase
      .from('settings')
      .select('value')
      .eq('key', 'storage_cleanup_enabled')
      .eq('scope', 'global')
      .maybeSingle(),
  ]);
  if (orphans.error) return new Response(orphans.error.message, { status: 500 });

  const rows = (orphans.data ?? []) as Orphan[];
  const enabled = Number(flag.data?.value) === 1;
  let removed = 0;
  const failures: string[] = [];
  if (enabled) {
    for (const batch of cleanupBatches(rows)) {
      const { error } = await supabase.storage.from(batch.bucket).remove(batch.names);
      if (error) failures.push(`${batch.bucket}: ${error.message}`);
      else removed += batch.names.length;
    }
  }
  return Response.json(
    { found: rows.length, removed, enabled, failures },
    { status: failures.length ? 500 : 200 },
  );
});
