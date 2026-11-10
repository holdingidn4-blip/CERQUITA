import { staffRoleFrom } from '@cerquita/shared';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { supabaseAnonKey, supabaseUrl } from '@/lib/env';

const PUBLIC_PATHS = ['/login', '/no-autorizado'];

/** Refresca la sesión en cada pedido y deja pasar solo a soporte. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  const redirectTo = (target: string) => {
    const res = NextResponse.redirect(new URL(target, request.url));
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (!data.user) return isPublic ? response : redirectTo('/login');
  const isStaff = staffRoleFrom(data.user.app_metadata) !== null;
  if (!isStaff && path !== '/no-autorizado') return redirectTo('/no-autorizado');
  if (isStaff && path === '/login') return redirectTo('/');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
