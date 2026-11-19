// Lógica pura de la limpieza de Storage (la usan la Edge Function storage-cleanup y sus pruebas).

export type Orphan = { bucket_id: string; name: string };
export type CleanupBatch = { bucket: string; names: string[] };

/** Agrupa los archivos huérfanos por bucket y los parte en lotes (Storage borra hasta 100 por llamada). */
export function cleanupBatches(rows: Orphan[], size = 100): CleanupBatch[] {
  const byBucket = new Map<string, string[]>();
  for (const { bucket_id: bucket, name } of rows) {
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), name]);
  }
  const batches: CleanupBatch[] = [];
  for (const [bucket, names] of byBucket) {
    for (let i = 0; i < names.length; i += size) {
      batches.push({ bucket, names: names.slice(i, i + size) });
    }
  }
  return batches;
}
