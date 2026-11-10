import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/auth/auth-provider';

/** Layout de grupo que exige sesión iniciada. */
export function SessionStack() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (!session) return <Redirect href="/ingreso" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
