import {
  formatSoles,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  parseSolesToCents,
  type PaymentMethod,
} from '@cerquita/shared';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { supabase } from '@/lib/supabase';
import { useDebt } from '@/pro/use-debt';
import { colors, fonts, radii } from '@/theme';

type Company = { yape: string; plin: string; holder: string; bank: string };

/**
 * Pantalla 15: el pago se hace FUERA de la app (Yape, Plin o transferencia a la empresa) y aquí solo se
 * sube la constancia. Nada de compras dentro de la app (regla 3).
 */
export default function PagarComision() {
  const { debt } = useDebt();
  const [method, setMethod] = useState<PaymentMethod>('yape');
  const [amount, setAmount] = useState('');
  const [operation, setOperation] = useState('');
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [company, setCompany] = useState<Company>({ yape: '', plin: '', holder: '', bank: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('settings')
      .select('key, value')
      .in('key', [
        'company_yape_number',
        'company_plin_number',
        'company_account_holder',
        'company_bank_account',
      ])
      .then(({ data }) => {
        const get = (k: string) => String(data?.find((r) => r.key === k)?.value ?? '');
        setCompany({
          yape: get('company_yape_number'),
          plin: get('company_plin_number'),
          holder: get('company_account_holder'),
          bank: get('company_bank_account'),
        });
      });
  }, []);

  const destination =
    method === 'yape'
      ? company.yape || '[NÚMERO]'
      : method === 'plin'
        ? company.plin || '[NÚMERO]'
        : company.bank || '[CUENTA]';

  async function pick() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!r.canceled) setPhoto(r.assets[0] ?? null);
  }

  async function submit() {
    const cents = parseSolesToCents(
      amount === '' ? String((debt?.pendingCents ?? 0) / 100) : amount,
    );
    if (!cents || cents <= 0) return setError('Escribe el monto que pagaste.');
    if (operation.trim().length < 3) return setError('Escribe el código de operación.');
    if (!photo) return setError('Sube la foto de tu constancia.');
    setBusy(true);
    setError(null);
    const { data: s } = await supabase.auth.getSession();
    const uid = s.session?.user.id;
    const ext = (photo.mimeType?.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
    const path = `${uid}/${Date.now().toString(36)}.${ext}`;
    const body = await (await fetch(photo.uri)).arrayBuffer();
    const up = await supabase.storage
      .from('payment-proofs')
      .upload(path, body, { contentType: photo.mimeType ?? 'image/jpeg' });
    const ins = up.error
      ? up
      : await supabase.from('payment_proofs').insert({
          method,
          operation_code: operation.trim(),
          amount_cents: cents,
          image_path: path,
        });
    setBusy(false);
    if (ins.error) {
      return setError(
        ins.error.message.includes('duplicate')
          ? 'Ese código de operación ya fue enviado.'
          : 'No pudimos enviar tu constancia. Intenta de nuevo.',
      );
    }
    router.replace('/comision');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="link" onPress={() => router.back()}>
          <Text style={styles.back}>‹ Mi comisión</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Pagar comisión
        </Text>
        <Text style={styles.secondary}>Pendiente: {formatSoles(debt?.pendingCents ?? 0)}</Text>
        <View
          style={styles.chips}
          accessibilityRole="radiogroup"
          accessibilityLabel="Medio de pago"
        >
          {PAYMENT_METHODS.map((m) => (
            <Pressable
              key={m}
              accessibilityRole="radio"
              accessibilityState={{ selected: m === method }}
              onPress={() => setMethod(m)}
              style={[styles.chip, m === method && styles.chipOn]}
            >
              <Text style={[styles.chipText, m === method && styles.chipTextOn]}>
                {PAYMENT_METHOD_LABELS[m]}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Paga a Cerquita por {PAYMENT_METHOD_LABELS[method]}</Text>
          <Text style={styles.big}>{destination}</Text>
          <Text style={styles.secondary}>Titular: {company.holder || '[TITULAR]'}</Text>
          <Text style={styles.secondary}>
            Luego sube aquí la constancia. Soporte la revisa y la descuenta de tu comisión.
          </Text>
        </View>
        <TextInput
          accessibilityLabel="Monto pagado"
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder={`Monto pagado (${formatSoles(debt?.pendingCents ?? 0)})`}
          placeholderTextColor={colors.textSecondary}
        />
        <TextInput
          accessibilityLabel="Código de operación"
          style={styles.input}
          value={operation}
          onChangeText={setOperation}
          placeholder="Código de operación"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="characters"
          maxLength={64}
        />
        {photo ? (
          <Image source={{ uri: photo.uri }} style={styles.photo} accessibilityLabel="Constancia" />
        ) : (
          <Button variant="outline" label="Subir constancia" onPress={pick} />
        )}
        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        <Button label="Enviar constancia" loading={busy} onPress={submit} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 14 },
  back: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.primary },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  secondary: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  label: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.text },
  big: { fontFamily: fonts.display, fontSize: 24, color: colors.text },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#D5D0C3',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.text },
  chipTextOn: { color: colors.surface },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 6,
  },
  input: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
  },
  photo: { width: '100%', height: 200, borderRadius: radii.md },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.md,
    padding: 12,
  },
});
