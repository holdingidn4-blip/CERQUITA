'use server';

import { revalidatePath } from 'next/cache';

import { createClient, requireStaff } from '@/lib/supabase/server';

import type { ActionState } from './action-form';

const note = (form: FormData) => String(form.get('note') ?? '').trim();

export async function setSuspension(
  userId: string,
  _p: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireStaff();
  const suspend = form.get('decision') === 'suspend';
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_suspension', {
    p_user: userId,
    p_suspend: suspend,
    p_reason: note(form),
  });
  if (error) return { error: error.message };
  revalidatePath(`/usuarios/${userId}`);
  return { error: null, ok: suspend ? 'Cuenta suspendida.' : 'Suspensión levantada.' };
}

export async function reverseEntry(
  entryId: string,
  userId: string,
  _p: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_reverse_entry', {
    p_entry: entryId,
    p_note: note(form),
  });
  if (error) return { error: error.message };
  revalidatePath(`/usuarios/${userId}`);
  return { error: null, ok: 'Asiento revertido.' };
}

export async function reviewReport(
  id: string,
  _p: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.rpc('review_report', {
    p_report: id,
    p_status: String(form.get('decision')),
    p_note: note(form),
  });
  if (error) return { error: error.message };
  revalidatePath('/reportes');
  return { error: null, ok: 'Reporte revisado.' };
}

export async function replyTicket(
  id: string,
  _p: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.rpc('reply_ticket', {
    p_ticket: id,
    p_reply: note(form),
    p_close: form.get('decision') === 'close',
  });
  if (error) return { error: error.message };
  revalidatePath('/soporte');
  return { error: null, ok: 'Respuesta enviada.' };
}

const cents = (v: FormDataEntryValue | null) => {
  const n = Math.round(Number(String(v ?? '').replace(',', '.')) * 100);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

export async function saveRateCard(
  id: number,
  _p: ActionState,
  form: FormData,
): Promise<ActionState> {
  const staff = await requireStaff();
  if (staff.staffRole !== 'admin') return { error: 'Solo un administrador edita el tarifario.' };
  const [min, sug, max] = [
    cents(form.get('min')),
    cents(form.get('suggested')),
    cents(form.get('max')),
  ];
  const visitRaw = String(form.get('visit') ?? '').trim();
  const visit = visitRaw === '' ? null : cents(visitRaw);
  if (!min || !sug || !max || min > sug || sug > max)
    return { error: 'Montos en soles: mínimo ≤ sugerido ≤ máximo.' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('trade_rate_cards')
    .update({ min_cents: min, suggested_cents: sug, max_cents: max, visit_fee_cents: visit })
    .eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/tarifario');
  return { error: null, ok: 'Guardado: rige desde ahora para pedidos nuevos.' };
}

export async function saveCatalogItem(
  id: string,
  _p: ActionState,
  form: FormData,
): Promise<ActionState> {
  const staff = await requireStaff();
  if (staff.staffRole !== 'admin') return { error: 'Solo un administrador edita el catálogo.' };
  const price = cents(form.get('price'));
  if (!price) return { error: 'Precio en soles inválido.' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('materials_catalog')
    .update({ reference_price_cents: price, active: form.get('decision') !== 'deactivate' })
    .eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/tarifario');
  return { error: null, ok: 'Guardado.' };
}

export async function addCatalogItem(_p: ActionState, form: FormData): Promise<ActionState> {
  const staff = await requireStaff();
  if (staff.staffRole !== 'admin') return { error: 'Solo un administrador edita el catálogo.' };
  const store = String(form.get('store') ?? '')
    .toLowerCase()
    .trim();
  const price = cents(form.get('price'));
  const name = String(form.get('name') ?? '').trim();
  const brand = String(form.get('brand') ?? '').trim();
  if (!['promart', 'sodimac', 'maestro', 'ferreteria', 'otro'].includes(store))
    return { error: 'Tienda: promart, sodimac, maestro, ferreteria u otro.' };
  if (!price || name.length < 3 || brand.length < 2)
    return { error: 'Completa marca, nombre y precio.' };
  const supabase = await createClient();
  const { error } = await supabase.from('materials_catalog').insert({
    store,
    brand,
    name,
    unit: String(form.get('unit') ?? 'unidad').trim() || 'unidad',
    reference_price_cents: price,
  });
  if (error) return { error: error.message };
  revalidatePath('/tarifario');
  return { error: null, ok: 'Material agregado.' };
}
