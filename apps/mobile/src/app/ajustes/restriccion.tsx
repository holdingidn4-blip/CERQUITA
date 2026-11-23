import { formatLimaDateTime } from '@cerquita/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radii } from '@/theme';

type Restriction = {
  id: string;
  reason: string;
  until: string | null;
  created_at: string;
  appeal_status: 'pending' | 'accepted' | 'rejected' | null;
  appeal_note: string | null;
};

const APPEAL_TEXT = {
  pending:
    'Tu apelación está en revisión. Una persona del equipo de soporte la revisa y te responde.',
  accepted: 'Tu apelación fue aceptada: la restricción ya no aplica.',
  rejected: 'Tu apelación no fue aceptada.',
} as const;

/** Restricción de la cuenta (lista negra): motivo, plazo y apelación revisada por una persona. */
export default function RestriccionScreen() {
  const [row, setRow] = useState<Restriction | null | undefined>(undefined);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_restriction');
    setRow(((data ?? [])[0] as Restriction | undefined) ?? null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function appeal() {
    if (!row) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('appeal_blacklist', { p_entry: row.id, p_text: text });
    setBusy(false);
    if (e) return setError(e.message);
    await load();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="link" onPress={() => router.replace('/ajustes')}>
          <Text style={styles.back}>‹ Ajustes</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Restricción de tu cuenta
        </Text>
        {row === null && <Text style={styles.body}>Tu cuenta no tiene restricciones.</Text>}
        {row && (
          <View style={styles.card} testID="restriccion">
            <Text style={styles.label}>Motivo</Text>
            <Text style={styles.body}>{row.reason}</Text>
            <Text style={styles.label}>Plazo</Text>
            <Text style={styles.body}>
              {row.until ? `Hasta el ${formatLimaDateTime(row.until)}` : 'Sin fecha de término'}
            </Text>
            <Text style={styles.secondary}>
              Mientras dure, no puedes hacer pedidos ni enviar cotizaciones. Puedes seguir usando el
              chat de servicios en curso, Ayuda y SOS.
            </Text>
            {row.appeal_status && (
              <Text style={styles.body}>
                {APPEAL_TEXT[row.appeal_status]}
                {row.appeal_note ? ` Respuesta: “${row.appeal_note}”` : ''}
              </Text>
            )}
          </View>
        )}
        {row && row.appeal_status === null && (
          <View style={styles.card}>
            <Text style={styles.h2}>Apelar</Text>
            <Text style={styles.secondary}>
              Cuéntanos qué pasó. Lo revisa una persona, no un sistema automático. Puedes apelar una
              vez.
            </Text>
            <TextInput
              accessibilityLabel="Tu apelación"
              style={styles.input}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={1000}
              placeholder="Ej. El cliente me pidió pagar en efectivo y lo puedo mostrar en el chat."
              placeholderTextColor={colors.textSecondary}
            />
            <Button
              label="Enviar apelación"
              loading={busy}
              disabled={text.trim().length < 10}
              onPress={appeal}
            />
          </View>
        )}
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
  h2: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  label: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.textSecondary },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text },
  secondary: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 14,
    gap: 6,
  },
  input: {
    minHeight: 100,
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
