import type { DebtInput } from '@cerquita/shared';
import { useCallback, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { usePolling } from '@/lib/use-polling';

export type Debt = DebtInput & { balanceCents: number; payToReactivateCents: number };

/** Estado de la comisión del profesional (lo calcula el servidor con el libro y settings). */
export function useDebt(ms = 15000) {
  const [debt, setDebt] = useState<Debt | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('pro_debt');
    const r = data?.[0];
    if (!r) return;
    setDebt({
      balanceCents: r.balance_cents,
      pendingCents: r.pending_cents,
      limitCents: r.limit_cents,
      graceDays: r.grace_days,
      overLimitSince: r.over_limit_since,
      paused: r.paused,
      payToReactivateCents: r.pay_to_reactivate_cents,
    });
  }, []);
  usePolling(load, ms);
  return { debt, reload: load };
}
