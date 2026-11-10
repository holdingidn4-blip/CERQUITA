import { homeRouteFor, initials, maskPhone, type Role } from '@cerquita/shared';
import { Link, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/button';
import { Segmented } from '@/components/segmented';
import { confirm } from '@/lib/confirm';
import { legalUrls } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { usePolling } from '@/lib/use-polling';
import { colors, fonts, radii } from '@/theme';

const MODE_OPTIONS = [
  { value: 'client', label: 'Cliente' },
  { value: 'pro', label: 'Profesional' },
] as const satisfies readonly { value: Role; label: string }[];

export default function Ajustes() {
  const { account, setActiveRole, signOut } = useAuth();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState(0);
  const [deleting, setDeleting] = useState(false);

  const loadContacts = useCallback(async () => {
    const { count } = await supabase
      .from('trusted_contacts')
      .select('id', { count: 'exact', head: true });
    setContacts(count ?? 0);
  }, []);
  usePolling(loadContacts, 60000);

  async function deleteAccount() {
    const ok = await confirm(
      '¿Eliminar tu cuenta?',
      'Borramos tu perfil, fotos y documentos, y cerramos tu sesión. No se puede deshacer.',
      'Eliminar',
    );
    if (!ok) return;
    setDeleting(true);
    setError(null);
    const { error: e } = await supabase.rpc('delete_my_account');
    setDeleting(false);
    if (e) return setError(e.message);
    // Las sesiones ya se cerraron en el servidor: solo queda limpiar el dispositivo.
    await signOut('local');
    router.replace('/ingreso');
  }

  async function changeMode(role: Role) {
    if (!account || role === account.activeRole) return;
    setSwitching(true);
    setError(null);
    try {
      const next = await setActiveRole(role);
      router.replace(homeRouteFor(role, next?.hasProTrades ?? false));
    } catch {
      setError('No pudimos cambiar el modo. Intenta de nuevo.');
    } finally {
      setSwitching(false);
    }
  }

  async function logout() {
    await signOut();
    router.replace('/ingreso');
  }

  const name = account?.fullName?.trim() || 'Tu cuenta';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          Cuenta y privacidad
        </Text>

        <View style={[styles.card, styles.profile]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(account?.fullName) || 'C'}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.secondary}>{maskPhone(account?.phone)}</Text>
          </View>
        </View>

        <Segmented
          look="pill"
          label="Modo de uso"
          options={MODE_OPTIONS}
          value={account?.activeRole ?? 'client'}
          onChange={changeMode}
          disabled={switching}
        />
        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}

        <View style={styles.card}>
          <Link href="/ajustes/contactos" asChild>
            <Pressable style={styles.row} accessibilityRole="link">
              <Text style={styles.rowText}>Contactos de confianza</Text>
              <Text style={styles.count}>{contacts} de 3</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </Link>
          <View style={styles.divider} />
          <Pressable
            style={styles.row}
            accessibilityRole="button"
            onPress={() => Linking.openSettings()}
          >
            <View style={styles.flex}>
              <Text style={styles.rowText}>Ubicación durante servicios</Text>
              <Text style={styles.secondary}>
                Solo con un servicio aceptado · cámbiala en los ajustes del teléfono
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <View style={styles.divider} />
          <Row
            label="Política de privacidad"
            onPress={() => WebBrowser.openBrowserAsync(legalUrls.privacy)}
          />
          <View style={styles.divider} />
          <Row
            label="Términos y condiciones"
            onPress={() => WebBrowser.openBrowserAsync(legalUrls.terms)}
          />
          <View style={styles.divider} />
          <Row
            label="Mis datos personales"
            onPress={() => WebBrowser.openBrowserAsync(legalUrls.personalData)}
          />
        </View>

        <View style={[styles.card, styles.danger]}>
          <Text style={styles.dangerTitle}>Eliminar mi cuenta</Text>
          <Text style={styles.secondary}>
            Borramos tu perfil, fotos y documentos. Guardamos solo lo que la ley exige, por el plazo
            de la política de privacidad.
          </Text>
          {/* Apple 5.1.1(v): la cuenta se elimina desde la app. */}
          <Button
            variant="danger"
            label="Eliminar cuenta"
            loading={deleting}
            onPress={deleteAccount}
          />
        </View>

        <Button variant="ghost" label="Cerrar sesión" onPress={logout} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.row} accessibilityRole="link" onPress={onPress}>
      <Text style={styles.rowText}>{label}</Text>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 14 },
  flex: { flex: 1 },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.text, paddingVertical: 20 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.display, fontSize: 16, color: colors.surface },
  name: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.text },
  secondary: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 16 },
  rowText: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.text },
  count: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, marginRight: 8 },
  chevron: { fontSize: 22, color: colors.textSecondary },
  divider: { height: 1, backgroundColor: '#F0EDE4', marginHorizontal: 16 },
  danger: { padding: 16, gap: 8 },
  dangerTitle: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.text },
  error: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.danger },
});
