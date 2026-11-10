import type { JobStatus } from '@cerquita/shared';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { usePolling } from '@/lib/use-polling';

export type ServiceJob = {
  id: string;
  status: JobStatus;
  description: string;
  client_id: string;
  final_price_cents: number | null;
  final_proposed_cents: number | null;
  commission_rate_bps: number | null;
  cancel_reason: string | null;
  trade: { name: string; pro_name: string } | null;
};
export type Counterpart = { id: string; name: string; rating: number | null; phone: string | null };
export type LiveLocation = {
  latitude: number;
  longitude: number;
  recorded_at: string;
  distance_m: number;
};

const COLUMNS =
  'id, status, description, client_id, final_price_cents, final_proposed_cents, commission_rate_bps, cancel_reason, trade:trades(name, pro_name)';

/**
 * Estado del servicio para cliente y profesional. El estado del pedido se consulta cada 4 s
 * (la tabla jobs no se publica en Realtime para no filtrar columnas ocultas); la ubicación llega
 * por Realtime (job_tracks, con RLS) y por consulta.
 */
export function useService(jobId: string, options: { live?: boolean } = {}) {
  const [job, setJob] = useState<ServiceJob | null | undefined>(undefined);
  const [other, setOther] = useState<Counterpart | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [live, setLive] = useState<LiveLocation | null>(null);

  const load = useCallback(async () => {
    const [j, c, a, s, l] = await Promise.all([
      supabase.from('jobs').select(COLUMNS).eq('id', jobId).maybeSingle(),
      supabase.rpc('job_counterpart', { p_job: jobId }),
      supabase.rpc('job_exact_address', { p_job: jobId }),
      supabase.rpc('job_security_code', { p_job: jobId }),
      options.live
        ? supabase.rpc('job_live_location', { p_job: jobId })
        : Promise.resolve({ data: null }),
    ]);
    setJob((j.data as ServiceJob | null) ?? null);
    setOther((c.data?.[0] as Counterpart | undefined) ?? null);
    setAddress(a.data ?? null);
    setCode(s.data ?? null);
    setLive(((l.data as LiveLocation[] | null) ?? [])[0] ?? null);
  }, [jobId, options.live]);

  usePolling(load, 4000);

  useEffect(() => {
    if (!options.live) return;
    const channel = supabase
      .channel(`tracks:${jobId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'job_tracks', filter: `job_id=eq.${jobId}` },
        () => {
          load();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId, options.live, load]);

  return { job, other, address, code, live, reload: load };
}
