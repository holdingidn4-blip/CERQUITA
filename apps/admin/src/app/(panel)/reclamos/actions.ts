'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient, requireStaff } from '@/lib/supabase/server';

export type ClaimState = { error: string | null };

export async function resolveClaim(
  id: string,
  _prev: ClaimState,
  form: FormData,
): Promise<ClaimState> {
  await requireStaff();
  const status = String(form.get('status'));
  const resolution = String(form.get('resolution') ?? '').trim();
  if (resolution === '') return { error: 'Escribe la resolución.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('resolve_claim', {
    p_claim: id,
    p_status: status,
    p_resolution: resolution,
  });
  if (error) return { error: error.message };
  revalidatePath('/reclamos');
  redirect('/reclamos?hecho=1');
}
