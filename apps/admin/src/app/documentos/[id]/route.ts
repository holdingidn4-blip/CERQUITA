import { NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/admin';
import { requireStaff, createClient } from '@/lib/supabase/server';

/** Segundos de vida de la URL firmada. */
const SIGNED_URL_TTL = 60;

/** Registra la vista (como el revisor) y redirige a una URL firmada de vida corta. */
export async function GET(_request: Request, ctx: RouteContext<'/documentos/[id]'>) {
  await requireStaff();
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc('log_document_access', { p_document: id });
  if (error || !path) return new NextResponse('Documento no encontrado', { status: 404 });

  const { data: signed, error: signError } = await createServiceClient()
    .storage.from('verification')
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (signError || !signed)
    return new NextResponse('El archivo no está disponible', { status: 404 });

  const response = NextResponse.redirect(signed.signedUrl);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
