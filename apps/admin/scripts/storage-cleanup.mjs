// Borra de Storage los archivos huérfanos: subidas a medias, borradores quitados y archivos de
// cuentas eliminadas (public.storage_orphans, con 1 día de margen).
// Uso: pnpm --filter @cerquita/admin storage:cleanup [--dry-run]
// Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (nunca en el repo).
import { createClient } from '@supabase/supabase-js';

const dryRun = process.argv.includes('--dry-run');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await supabase.rpc('storage_orphans');
if (error) {
  console.error(error.message);
  process.exit(1);
}
const byBucket = new Map();
for (const { bucket_id: bucket, name } of data ?? []) {
  byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), name]);
}
let removed = 0;
for (const [bucket, names] of byBucket) {
  for (let i = 0; i < names.length; i += 100) {
    const batch = names.slice(i, i + 100);
    if (dryRun) {
      console.log(`[prueba] ${bucket}: ${batch.length} archivos`);
      continue;
    }
    const { error: removeError } = await supabase.storage.from(bucket).remove(batch);
    if (removeError) {
      console.error(`${bucket}: ${removeError.message}`);
      process.exitCode = 1;
      continue;
    }
    removed += batch.length;
  }
}
console.log(
  dryRun
    ? `${data?.length ?? 0} archivos huérfanos encontrados`
    : `${removed} archivos huérfanos borrados`,
);
