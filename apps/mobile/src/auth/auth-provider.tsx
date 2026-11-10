import type { Role } from '@cerquita/shared';
import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from '@/lib/supabase';

export type Account = {
  id: string;
  phone: string | null;
  fullName: string | null;
  activeRole: Role;
  avatarUrl: string | null;
  hasProTrades: boolean;
  staffRole: string | null;
};

type AuthState = {
  session: Session | null;
  account: Account | null;
  loading: boolean;
  refreshAccount: () => Promise<Account | null>;
  setActiveRole: (role: Role) => Promise<Account | null>;
  /** `local`: solo borra la sesión del dispositivo (p. ej. tras eliminar la cuenta en el servidor). */
  signOut: (scope?: 'global' | 'local') => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function fetchAccount(): Promise<Account | null> {
  const { data, error } = await supabase.rpc('my_account');
  const row = data?.[0];
  if (error || !row) return null;
  return {
    id: row.id,
    phone: row.phone,
    fullName: row.full_name,
    activeRole: row.active_role,
    avatarUrl: row.avatar_url,
    hasProTrades: row.has_pro_trades,
    staffRole: row.staff_role,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshAccount = useCallback(async () => {
    const next = await fetchAccount();
    setAccount(next);
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) await refreshAccount();
      if (active) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) setAccount(null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [refreshAccount]);

  const setActiveRole = useCallback(
    async (role: Role) => {
      // Se lee del cliente y no del estado: justo después de verificar, el estado aún no se actualiza.
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) return null;
      const { error } = await supabase
        .from('profiles')
        .update({ active_role: role })
        .eq('id', userId);
      if (error) throw error;
      return refreshAccount();
    },
    [refreshAccount],
  );

  const signOut = useCallback(async (scope: 'global' | 'local' = 'global') => {
    const { error } = await supabase.auth.signOut({ scope });
    if (error && scope === 'global') await supabase.auth.signOut({ scope: 'local' });
    setSession(null);
    setAccount(null);
  }, []);

  const value = useMemo(
    () => ({ session, account, loading, refreshAccount, setActiveRole, signOut }),
    [session, account, loading, refreshAccount, setActiveRole, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
