'use server';

import { parseQuizText } from '@cerquita/shared';
import { revalidatePath } from 'next/cache';

import { createClient, requireStaff } from '@/lib/supabase/server';

import type { ActionState } from '../_components/action-form';

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

/** Si hay un error, se devuelve lo escrito para que el formulario no se vacíe. */
export type TrainingState = ActionState & { values?: Record<string, string> };

export async function createTraining(_p: TrainingState, form: FormData): Promise<TrainingState> {
  await requireStaff();
  const values = Object.fromEntries(
    [...form.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']),
  );
  const fail = (error: string): TrainingState => ({ error, values });
  const quiz = parseQuizText(text(form, 'quiz'));
  if (!quiz.ok) return fail(quiz.error);
  const when = text(form, 'starts_at');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when)) return fail('Elige fecha y hora.');
  const points = Number(text(form, 'points') || '50');
  const passPct = Number(text(form, 'pass_pct') || '70');
  if (!Number.isInteger(points) || !Number.isInteger(passPct))
    return fail('Puntos y porcentaje deben ser números enteros.');
  const trade = text(form, 'trade');
  const supabase = await createClient();
  const { error } = await supabase.rpc('create_training', {
    p_city: text(form, 'city') || 'huancayo',
    p_trade: trade ? Number(trade) : (null as unknown as number),
    p_title: text(form, 'title'),
    p_description: text(form, 'description'),
    // La hora se escribe en hora de Lima (UTC−5, sin horario de verano).
    p_starts_at: `${when}:00-05:00`,
    p_place: text(form, 'place'),
    p_points: points,
    p_pass_pct: passPct,
    p_quiz: quiz.quiz,
  });
  if (error) return fail(error.message);
  revalidatePath('/capacitaciones');
  return { error: null, ok: 'Capacitación creada.' };
}

export async function generateCodes(
  trainingId: string,
  _p: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireStaff();
  const count = Number(text(form, 'count') || '0');
  const supabase = await createClient();
  const { error } = await supabase.rpc('create_training_codes', {
    p_training: trainingId,
    p_count: count,
  });
  if (error) return { error: error.message };
  revalidatePath(`/capacitaciones/${trainingId}`);
  return { error: null, ok: `${count} códigos generados.` };
}

export async function cancelTraining(trainingId: string): Promise<void> {
  await requireStaff();
  const supabase = await createClient();
  await supabase.rpc('cancel_training', { p_training: trainingId });
  revalidatePath(`/capacitaciones/${trainingId}`);
  revalidatePath('/capacitaciones');
}
