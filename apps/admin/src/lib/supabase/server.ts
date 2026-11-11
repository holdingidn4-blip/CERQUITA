import 'server-only';

import { staffRoleFrom, type StaffRole } from '@cerquita/shared';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { authCookieName, supabaseAnonKey, supabaseUrl } from '@/lib/env';
import type { Database } from '@cerquita/shared';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookieOptions: { name: authCookieName },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // En Server Components no se pueden escribir cookies; el proxy ya refresca la sesión.
        }
      },
    },
  });
}

/** Exige un usuario de soporte. Valida el usuario con el servidor de Auth, no solo la cookie. */
export async function requireStaff(): Promise<{
  userId: string;
  phone: string | null;
  staffRole: StaffRole;
}> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');
  const staffRole = staffRoleFrom(data.user.app_metadata);
  if (!staffRole) redirect('/no-autorizado');
  return { userId: data.user.id, phone: data.user.phone ?? null, staffRole };
}
