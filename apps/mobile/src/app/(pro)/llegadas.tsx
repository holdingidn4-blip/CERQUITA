import { formatLimaDateTime } from '@cerquita/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { supabase } from '@/lib/supabase';
import { useSettingInt } from '@/lib/settings';
import { colors, fonts, radii } from '@/theme';

type NoShow = {
  id: string;
  reported_at: string;
  promised_arrival_at: string;
  appeal_status: 'pending' | 'accepted' | 'rejected' | null;
  appeal_note: string | null;
};

const STATUS_TEXT: Record<'pending' | 'accepted' | 'rejected', string> = {
  pending: 'Apelación en revisión. Te avisamos cuando soporte decida.',
  accepted: 'Apelación aceptada: ya no cuenta para la pausa.',
  rejected: 'Apelación no aceptada.',
};

/** Llegadas incumplidas: cada una es una advertencia y se puede apelar dentro del plazo. */
export default function Llegadas() {
  const appealDays = useSettingInt('no_show_appeal_days') ?? 7;
  const strikes = useSettingInt('no_show_strikes') ?? 3;
  const [rows, setRows] = useState<NoShow[] | null>(null);
  const [open, setOpen] = useState<string[]>([]);
  const [text, setText] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('pro_no_shows')
      .select('id, reported_at, promised_arrival_at, appeal_status, appeal_note')
      .order('reported_at', { ascending: false })
      .limit(20);
    const list = (data ?? []) as NoShow[];
    // Se calcula al cargar (no al dibujar): cuáles siguen dentro del plazo para apelar.
    const since = Date.now() - appealDays * 86_400_000;
    setOpen(
      list
        .filter((r) => r.appeal_status === null && new Date(r.reported_at).getTime() > since)
        .map((r) => r.id),
    );
    setRows(list);
  }, [appealDays]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function appeal(id: string) {
    setBusy(id);
    setError(null);
    const { error: e } = await supabase.rpc('appeal_no_show', {
      p_no_show: id,
      p_text: text[id] ?? '',
    });
    setBusy(null);
    if (e) setError(e.message);
    await load();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="link" onPress={() => router.replace('/solicitudes')}>
          <Text style={styles.back}>‹ Solicitudes</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Llegadas incumplidas
        </Text>
        <Text style={styles.secondary}>
          Si no llegas a la hora acordada, el cliente puede elegir a otro profesional y se registra
          una advertencia. Con {strikes} en 30 días tus ofertas se pausan. Si no fue tu culpa, apela
          dentro de {appealDays} días.
        </Text>
        {rows?.length === 0 && (
          <Text style={styles.secondary}>No tienes llegadas incumplidas. ¡Bien!</Text>
        )}
        {(rows ?? []).map((r) => {
          const canAppeal = open.includes(r.id);
          return (
            <View key={r.id} style={styles.card} testID="llegada-incumplida">
              <Text style={styles.cardTitle}>
                Advertencia del {formatLimaDateTime(r.reported_at)}
              </Text>
              <Text style={styles.secondary}>
                Llegada acordada: {formatLimaDateTime(r.promised_arrival_at)}
              </Text>
              {r.appeal_status && (
                <Text style={styles.body}>
                  {STATUS_TEXT[r.appeal_status]}
                  {r.appeal_status === 'rejected' && r.appeal_note
                    ? ` Motivo: “${r.appeal_note}”`
                    : ''}
                </Text>
              )}
              {canAppeal && (
                <>
                  <TextInput
                    accessibilityLabel="Cuéntanos qué pasó"
                    style={styles.input}
                    value={text[r.id] ?? ''}
                    onChangeText={(t) => setText((s) => ({ ...s, [r.id]: t }))}
                    placeholder="Ej. Me chocaron en el camino y avisé al cliente por el chat."
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    maxLength={500}
                  />
                  <Button label="Apelar" loading={busy === r.id} onPress={() => appeal(r.id)} />
                </>
              )}
              {!canAppeal && r.appeal_status === null && (
                <Text style={styles.secondary}>El plazo para apelar ya pasó.</Text>
              )}
            </View>
          );
        })}
        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, gap: 12 },
  back: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.primary },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.text },
  secondary: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 14,
    gap: 8,
  },
  cardTitle: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.text },
  input: {
    minHeight: 88,
    padding: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.md,
    padding: 12,
  },
});
