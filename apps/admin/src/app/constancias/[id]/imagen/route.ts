import { NextResponse } from 'next/server';

import { createClient, requireStaff } from '@/lib/supabase/server';

/** Imagen de la constancia con URL firmada de 60 s (el bucket es privado; soporte tiene lectura). */
export async function GET(_req: Request, ctx: RouteContext<'/constancias/[id]/imagen'>) {
  await requireStaff();
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: proof } = await supabase
    .from('payment_proofs')
    .select('image_path')
    .eq('id', id)
    .maybeSingle();
  if (!proof) return new NextResponse('Constancia no encontrada', { status: 404 });
  const { data } = await supabase.storage
    .from('payment-proofs')
    .createSignedUrl(proof.image_path, 60);
  if (!data) return new NextResponse('Imagen no disponible', { status: 404 });
  const res = NextResponse.redirect(data.signedUrl);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
