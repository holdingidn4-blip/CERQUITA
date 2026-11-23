'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient, requireStaff } from '@/lib/supabase/server';

const DECISIONS = ['approve', 'needs_info', 'reject'] as const;
type Decision = (typeof DECISIONS)[number];

const BACKGROUNDS = ['apto', 'con_restriccion', 'no_apto'];

export type ReviewState = { error: string | null };

export async function decide(id: string, _prev: ReviewState, form: FormData): Promise<ReviewState> {
  await requireStaff();
  const decision = form.get('decision');
  if (!DECISIONS.includes(decision as Decision)) return { error: 'Decisión inválida.' };
  const reason = String(form.get('reason') ?? '').trim();
  const background = String(form.get('background') ?? '');
  if (decision !== 'approve' && reason === '') {
    return { error: 'Escribe el motivo para pedir datos o rechazar.' };
  }
  if (decision === 'approve' && !['apto', 'con_restriccion'].includes(background)) {
    return { error: 'Para aprobar, marca el resultado de antecedentes: apto o con restricción.' };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc('review_pro_trade', {
    p_pro_trade: id,
    p_decision: decision as Decision,
    p_reason: reason === '' ? undefined : reason,
    p_background: BACKGROUNDS.includes(background) ? background : undefined,
  });
  if (error) return { error: error.message };
  revalidatePath('/verificacion');
  redirect(`/verificacion?hecho=${decision}`);
}
