'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient, requireStaff } from '@/lib/supabase/server';

export type BypassState = { error: string | null };

export async function reviewSuspicion(
  id: string,
  _prev: BypassState,
  form: FormData,
): Promise<BypassState> {
  await requireStaff();
  const note = String(form.get('note') ?? '').trim();
  if (note === '') return { error: 'Escribe una nota.' };
  const confirmFraud = form.get('decision') === 'confirm';
  const supabase = await createClient();
  const { error } = await supabase.rpc('review_bypass', {
    p_id: id,
    p_confirm: confirmFraud,
    p_note: note,
  });
  if (error) return { error: error.message };
  revalidatePath('/sospechas');
  redirect(`/sospechas?hecho=${confirmFraud ? 'confirmada' : 'descartada'}`);
}
