'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient, requireStaff } from '@/lib/supabase/server';

export type BlacklistState = { error: string | null };

export async function addLocation(_prev: BlacklistState, form: FormData): Promise<BlacklistState> {
  const staff = await requireStaff();
  const lat = Number(form.get('lat'));
  const lng = Number(form.get('lng'));
  const reason = String(form.get('reason') ?? '').trim();
  const address = String(form.get('address') ?? '').trim();
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { error: 'Coordenadas inválidas (ej. -12.0651, -75.2049).' };
  }
  if (reason.length < 3) return { error: 'Escribe el motivo (solo lo ve soporte).' };
  const supabase = await createClient();
  const { error } = await supabase.from('blacklisted_locations').insert({
    point: `SRID=4326;POINT(${lng} ${lat})`,
    reason,
    address_text: address || null,
    created_by: staff.userId,
  });
  if (error) return { error: error.message };
  revalidatePath('/lista-negra');
  redirect('/lista-negra?hecho=agregada');
}

export async function deactivate(id: string) {
  await requireStaff();
  const supabase = await createClient();
  await supabase.from('blacklisted_locations').update({ active: false }).eq('id', id);
  revalidatePath('/lista-negra');
}
