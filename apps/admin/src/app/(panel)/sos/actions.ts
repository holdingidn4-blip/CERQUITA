'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient, requireStaff } from '@/lib/supabase/server';

export type SosState = { error: string | null };

export async function closeAlert(id: string, _prev: SosState, form: FormData): Promise<SosState> {
  await requireStaff();
  const note = String(form.get('note') ?? '').trim();
  if (note === '') return { error: 'Escribe una nota de cierre.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('sos_close', { p_alert: id, p_note: note });
  if (error) return { error: error.message };
  revalidatePath('/sos');
  redirect('/sos?hecho=cerrada');
}
