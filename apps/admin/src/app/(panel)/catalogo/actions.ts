'use server';

import { revalidatePath } from 'next/cache';

import { createClient, requireStaff } from '@/lib/supabase/server';

import type { ActionState } from '../_components/action-form';

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

/** Crea (sin id) o edita un trabajo del catálogo. Solo soporte o administración (lo valida el servidor). */
export async function saveSpecialty(_p: ActionState, form: FormData): Promise<ActionState> {
  await requireStaff();
  const id = text(form, 'id');
  const sort = Number(text(form, 'sort') || '100');
  if (!Number.isInteger(sort) || sort < 0 || sort > 999)
    return { error: 'El orden debe ser un número de 0 a 999.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('save_trade_specialty', {
    p_id: id ? Number(id) : (null as unknown as number),
    p_trade: Number(text(form, 'trade')),
    p_name: text(form, 'name'),
    p_search_terms: text(form, 'terms'),
    p_requires_review: form.get('risky') === 'on',
    p_active: id ? form.get('active') === 'on' : true,
    p_sort_order: sort,
  });
  if (error) return { error: error.message };
  revalidatePath('/catalogo');
  return { error: null, ok: id ? 'Guardado.' : 'Trabajo agregado.' };
}

/** "Otro trabajo" de un profesional: agregarlo al catálogo (común o de riesgo) o rechazarlo con motivo. */
export async function reviewRequest(
  requestId: string,
  _p: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireStaff();
  const decision = text(form, 'decision');
  const note = text(form, 'note');
  if (!['approve', 'approve_risky', 'reject'].includes(decision))
    return { error: 'Decisión inválida.' };
  if (decision === 'reject' && note === '') return { error: 'Escribe el motivo para rechazar.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('review_specialty_request', {
    p_request: requestId,
    p_decision: decision === 'reject' ? 'reject' : 'approve',
    p_name: text(form, 'name') || undefined,
    p_requires_review: decision === 'approve_risky',
    p_reason: note || undefined,
  });
  if (error) return { error: error.message };
  revalidatePath('/catalogo');
  return { error: null, ok: decision === 'reject' ? 'Rechazado.' : 'Agregado al catálogo.' };
}
