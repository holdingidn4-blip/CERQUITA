import {
  CLIENT_PAYMENT_LABELS,
  CLIENT_PAYMENT_METHODS,
  formatSolesShort,
  jobTitle,
  RATING_TAGS,
  type ClientPaymentMethod,
} from '@cerquita/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { InitialsAvatar } from '@/components/initials-avatar';
import { Stars } from '@/components/stars';
import { supabase } from '@/lib/supabase';
import { useService } from '@/service/use-service';
import { colors, fonts, radii } from '@/theme';

/** Pantalla 6: medio de pago usado y calificación. Solo trabajos confirmados en la app. */
export default function Calificar() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, other } = useService(id);
  const [method, setMethod] = useState<ClientPaymentMethod>('cash');
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!job || !other) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  async function send() {
    if (stars === 0) return setError('Elige cuántas estrellas le das.');
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.from('ratings').insert({
      job_id: id,
      to_id: other!.id,
      stars,
      tags,
      comment: comment.trim() || null,
      payment_method_used: method,
    });
    setBusy(false);
    if (e)
      return setError(
        e.code === '23505'
          ? 'Ya calificaste este servicio.'
          : 'No pudimos guardar tu calificación.',
      );
    router.replace('/inicio');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title} accessibilityRole="header">
          Trabajo terminado
        </Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <InitialsAvatar name={other.name} />
            <View style={styles.flex}>
              <Text style={styles.name}>{other.name}</Text>
              <Text style={styles.secondary}>
                {jobTitle(job.description)} · {job.trade?.pro_name}
              </Text>
            </View>
          </View>
          <View style={styles.line}>
            <Text style={styles.body}>Total a pagar</Text>
            <Text style={styles.total}>{formatSolesShort(job.final_price_cents ?? 0)}</Text>
          </View>
          <View
            style={styles.chips}
            accessibilityRole="radiogroup"
            accessibilityLabel="Medio de pago usado"
          >
            {CLIENT_PAYMENT_METHODS.map((m) => (
              <Pressable
                key={m}
                accessibilityRole="radio"
                accessibilityState={{ selected: m === method }}
                onPress={() => setMethod(m)}
                style={[styles.chip, m === method && styles.chipOn]}
              >
                <Text style={[styles.chipText, m === method && styles.chipTextOn]}>
                  {CLIENT_PAYMENT_LABELS[m]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Text style={styles.h2}>¿Cómo fue el servicio?</Text>
        <Stars value={stars} onChange={setStars} />
        <View style={styles.tags}>
          {RATING_TAGS.map((t) => {
            const on = tags.includes(t);
            return (
              <Pressable
                key={t}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => setTags((prev) => (on ? prev.filter((x) => x !== t) : [...prev, t]))}
                style={[styles.tag, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{t}</Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          accessibilityLabel="Comentario (opcional)"
          style={[styles.input, styles.multiline]}
          value={comment}
          onChangeText={setComment}
          placeholder="Cuéntanos cómo te fue"
          placeholderTextColor={colors.textSecondary}
          multiline
          maxLength={1000}
        />
        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        <Button label="Enviar calificación" loading={busy} onPress={send} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, gap: 14 },
  flex: { flex: 1 },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text, marginTop: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.text },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  total: { fontFamily: fonts.display, fontSize: 24, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 15, color: colors.text },
  secondary: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  h2: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.text, textAlign: 'center' },
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
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  tag: {
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#D5D0C3',
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.text },
  chipTextOn: { color: colors.surface },
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
  multiline: { minHeight: 90, paddingTop: 14, textAlignVertical: 'top' },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.md,
    padding: 12,
  },
});
