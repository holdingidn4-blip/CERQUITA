import { homeRouteFor } from '@cerquita/shared';
import { Redirect } from 'expo-router';

import { useAuth } from '@/auth/auth-provider';

/** Decide a dónde ir según la sesión y el modo activo. */
export default function Index() {
  const { session, account } = useAuth();
  if (!session || !account) return <Redirect href="/ingreso" />;
  return <Redirect href={homeRouteFor(account.activeRole, account.hasProTrades)} />;
}
