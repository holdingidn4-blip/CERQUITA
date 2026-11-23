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
  'diagnostic_visit_fee_cents',
  'default_visit_fee_cents',
  'points_per_sol',
  'point_value_cents',
  'max_points_discount_pct',
  'bypass_minutes',
  'bypass_radius_m',
  'bypass_max_per_week',
  'no_show_grace_minutes',
  'no_show_strikes',
  'no_show_window_days',
  'default_eta_minutes',
  'proof_review_hours',
  'support_reply_hours',
  'storage_cleanup_enabled',
  'ops_outbox_stale_minutes',
  'schedule_reminder_minutes',
  'quote_max_transport_cents',
  'no_show_coupon_cents',
  'no_show_coupon_monthly_cap_cents',
  'coupon_valid_days',
  'no_show_appeal_days',
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
    if (key === 'storage_cleanup_enabled' && value > 1)
      return { error: 'Usa 1 para borrar o 0 para solo contar.', saved: false };
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
