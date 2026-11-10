'use server';

import { revalidatePath } from 'next/cache';

import { createClient, requireStaff } from '@/lib/supabase/server';

export type ParamState = { error: string | null; saved: boolean };

const INTEGER_KEYS = new Set([
  'commission_rate_bps',
  'debt_limit_cents',
  'grace_days',
  'launch_promo_jobs',
  'full_approval_ratings',
  'full_approval_min_stars',
  'min_trade_evidence',
  'reject_retry_days',
]);

export async function saveParam(
  key: string,
  scope: string,
  _prev: ParamState,
  form: FormData,
): Promise<ParamState> {
  const staff = await requireStaff();
  if (staff.staffRole !== 'admin')
    return { error: 'Solo un administrador cambia parámetros.', saved: false };
  const raw = String(form.get('value') ?? '').trim();
  let value: number | string = raw;
  if (INTEGER_KEYS.has(key)) {
    if (!/^\d+$/.test(raw)) return { error: 'Debe ser un número entero.', saved: false };
    value = Number(raw);
    if (key === 'commission_rate_bps' && value > 10000)
      return { error: 'Máximo 10000 (100 %).', saved: false };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from('settings')
    .update({ value })
    .eq('key', key)
    .eq('scope', scope);
  if (error) return { error: error.message, saved: false };
  revalidatePath('/parametros');
  return { error: null, saved: true };
}
