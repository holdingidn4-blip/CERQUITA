import { describe, expect, it } from 'vitest';
import { cleanupBatches } from '../../../supabase/functions/_shared/cleanup';

describe('limpieza de Storage', () => {
  it('agrupa los huérfanos por bucket', () => {
    expect(
      cleanupBatches([
        { bucket_id: 'job-photos', name: 'a/1.jpg' },
        { bucket_id: 'verification', name: 'u/dni.jpg' },
        { bucket_id: 'job-photos', name: 'b/2.jpg' },
      ]),
    ).toEqual([
      { bucket: 'job-photos', names: ['a/1.jpg', 'b/2.jpg'] },
      { bucket: 'verification', names: ['u/dni.jpg'] },
    ]);
  });
  it('parte en lotes de 100 (límite de Storage por llamada)', () => {
    const rows = Array.from({ length: 205 }, (_, i) => ({
      bucket_id: 'temp_media',
      name: `v${i}`,
    }));
    expect(cleanupBatches(rows).map((b) => b.names.length)).toEqual([100, 100, 5]);
  });
  it('sin huérfanos no hay lotes', () => {
    expect(cleanupBatches([])).toEqual([]);
  });
});
