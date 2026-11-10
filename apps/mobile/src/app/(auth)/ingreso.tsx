import {
  homeRouteFor,
  isValidOtp,
  maskPhone,
  normalizePeruMobile,
  OTP_LENGTH,
  OTP_RESEND_SECONDS,
  type Role,
} from '@cerquita/shared';
import { Redirect, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/button';
import { Logo } from '@/components/logo';
import { Segmented } from '@/components/segmented';
import { isSupabaseConfigured, legalUrls } from '@/lib/env';
import { authErrorMessage, supabase } from '@/lib/supabase';
import { colors, fonts, radii, spacing } from '@/theme';

const ROLE_OPTIONS = [
  { value: 'client', label: 'Necesito un servicio' },
  { value: 'pro', label: 'Ofrezco mis servicios' },
] as const satisfies readonly { value: Role; label: string }[];

export default function Ingreso() {
  const { session, account, refreshAccount, setActiveRole } = useAuth();
  // Solo al abrir la pantalla: si ya hay sesión, no se muestra el ingreso.
  // (Durante la verificación no redirige, para no saltar con el modo anterior.)
  const [alreadyIn] = useState(() =>
    session && account ? homeRouteFor(account.activeRole, account.hasProTrades) : null,
  );
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [rawPhone, setRawPhone] = useState('');
  const [role, setRole] = useState<Role>('client');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeInput = useRef<ComponentRef<typeof TextInput>>(null);

  const phone = normalizePeruMobile(rawPhone);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  async function sendCode() {
    if (!phone) {
      setError('Escribe un celular de 9 dígitos que empiece con 9.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone });
    setBusy(false);
    if (otpError) {
      setError(authErrorMessage(otpError));
      return;
    }
    setStep('code');
    setCode('');
    setResendIn(OTP_RESEND_SECONDS);
    setTimeout(() => codeInput.current?.focus(), 100);
  }

  async function verify() {
    if (!phone || !isValidOtp(code)) {
      setError(`Escribe los ${OTP_LENGTH} dígitos del código.`);
      return;
    }
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone,
      token: code,
      type: 'sms',
    });
    if (verifyError) {
      setBusy(false);
      setError(authErrorMessage(verifyError));
      return;
    }
    try {
      const current = await refreshAccount();
      const account = current?.activeRole === role ? current : await setActiveRole(role);
      router.replace(homeRouteFor(role, account?.hasProTrades ?? false));
    } catch {
      setError('Ingresaste, pero no pudimos guardar tu modo. Cámbialo en Cuenta y privacidad.');
      router.replace('/ajustes');
    } finally {
      setBusy(false);
    }
  }

  if (alreadyIn) return <Redirect href={alreadyIn} />;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Logo />
            <Text style={styles.tagline}>
              Tú pones el precio. Gasfiteros, electricistas, carpinteros y más responden desde tu
              zona.
            </Text>
          </View>

          {!isSupabaseConfigured && (
            <Text style={styles.warning}>
              Falta configurar Supabase: copia apps/mobile/.env.example a .env.local.
            </Text>
          )}

          {step === 'phone' ? (
            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.label} nativeID="phone-label">
                  Número de celular
                </Text>
                <View style={styles.phoneRow}>
                  <View style={styles.prefix}>
                    <Text style={styles.prefixText}>+51</Text>
                  </View>
                  <TextInput
                    accessibilityLabelledBy="phone-label"
                    style={styles.input}
                    value={rawPhone}
                    onChangeText={(text) => {
                      setRawPhone(text);
                      setError(null);
                    }}
                    placeholder="9XX XXX XXX"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    autoComplete="tel"
                    maxLength={15}
                    returnKeyType="done"
                    onSubmitEditing={sendCode}
                  />
                </View>
              </View>
              <Segmented
                label="¿Cómo quieres usar Cerquita?"
                options={ROLE_OPTIONS}
                value={role}
                onChange={setRole}
              />
            </View>
          ) : (
            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.label} nativeID="code-label">
                  Código que te enviamos al {maskPhone(phone)}
                </Text>
                <TextInput
                  ref={codeInput}
                  accessibilityLabelledBy="code-label"
                  style={[styles.input, styles.codeInput]}
                  value={code}
                  onChangeText={(text) => {
                    setCode(text.replace(/\D/g, '').slice(0, OTP_LENGTH));
                    setError(null);
                  }}
                  placeholder="••••••"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  maxLength={OTP_LENGTH}
                  onSubmitEditing={verify}
                />
              </View>
              <View style={styles.inlineActions}>
                <Button
                  variant="ghost"
                  label={resendIn > 0 ? `Reenviar en ${resendIn} s` : 'Reenviar código'}
                  disabled={resendIn > 0 || busy}
                  onPress={sendCode}
                />
                <Button
                  variant="ghost"
                  label="Cambiar número"
                  disabled={busy}
                  onPress={() => {
                    setStep('phone');
                    setError(null);
                  }}
                />
              </View>
            </View>
          )}

          {error && (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          )}

          <View style={styles.footer}>
            {step === 'phone' ? (
              <Button label="Recibir código por SMS" loading={busy} onPress={sendCode} />
            ) : (
              <Button
                label="Ingresar"
                loading={busy}
                disabled={code.length < OTP_LENGTH}
                onPress={verify}
              />
            )}
            <Text style={styles.legal}>
              Al continuar aceptas los{' '}
              <Text
                style={styles.link}
                onPress={() => WebBrowser.openBrowserAsync(legalUrls.terms)}
              >
                Términos
              </Text>{' '}
              y la{' '}
              <Text
                style={styles.link}
                onPress={() => WebBrowser.openBrowserAsync(legalUrls.privacy)}
              >
                Política de privacidad
              </Text>
              .
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: spacing.lg,
    gap: 20,
  },
  header: { gap: 10 },
  tagline: { fontFamily: fonts.bodyMedium, fontSize: 18, lineHeight: 25, color: '#2F3B36' },
  warning: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.amberSoft,
    borderRadius: radii.md,
    padding: 12,
  },
  form: { gap: 14 },
  field: { gap: 6 },
  label: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.text },
  phoneRow: { flexDirection: 'row', gap: 8 },
  prefix: {
    width: 64,
    height: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefixText: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  input: {
    flex: 1,
    minWidth: 0,
    height: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
  },
  codeInput: {
    flex: 0,
    fontFamily: fonts.display,
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
  },
  inlineActions: { flexDirection: 'row', justifyContent: 'space-between' },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.md,
    padding: 12,
  },
  footer: { marginTop: 'auto', gap: 12 },
  legal: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  link: { fontFamily: fonts.bodySemibold, color: colors.primary },
});
