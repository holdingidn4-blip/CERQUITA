'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient, requireStaff } from '@/lib/supabase/server';

export type ProofState = { error: string | null; done: string | null };

export async function reviewProof(
  id: string,
  _prev: ProofState,
  form: FormData,
): Promise<ProofState> {
  await requireStaff();
  const approve = form.get('decision') === 'approve';
  const note = String(form.get('note') ?? '').trim();
  if (!approve && note === '') return { error: 'Escribe el motivo del rechazo.', done: null };
  const supabase = await createClient();
  const { error } = await supabase.rpc('review_payment_proof', {
    p_proof: id,
    p_approve: approve,
    p_note: note === '' ? undefined : note,
  });
  if (error) return { error: error.message, done: null };
  revalidatePath('/constancias');
  redirect(`/constancias?hecho=${approve ? 'aprobada' : 'rechazada'}`);
}
