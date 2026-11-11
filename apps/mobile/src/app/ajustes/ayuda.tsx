import {
  SUPPORT_CATEGORIES,
  TICKET_STATUS_LABELS,
  timeAgo,
  type SupportCategory,
} from '@cerquita/shared';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { supabase } from '@/lib/supabase';
import { usePolling } from '@/lib/use-polling';
import { colors, fonts, radii } from '@/theme';

type Ticket = {
  id: string;
  category: SupportCategory;
  subject: string;
  body: string;
  status: keyof typeof TICKET_STATUS_LABELS;
  staff_reply: string | null;
  created_at: string;
};

/** Canal de ayuda y soporte/reclamos (support_tickets). */
export default function Ayuda() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [category, setCategory] = useState<SupportCategory>('app');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('support_tickets')
      .select('id, category, subject, body, status, staff_reply, created_at')
      .order('created_at', { ascending: false });
    setTickets((data ?? []) as Ticket[]);
  }, []);
  usePolling(load, 30000);

  async function send() {
    if (subject.trim().length < 3 || body.trim().length < 10)
      return setError('Escribe un asunto y cuéntanos el problema (mínimo 10 letras).');
    setBusy(true);
    setError(null);
    const { error: e } = await supabase
      .from('support_tickets')
      .insert({ category, subject: subject.trim(), body: body.trim() });
    setBusy(false);
    if (e) return setError('No pudimos enviar tu consulta. Intenta de nuevo.');
    setSubject('');
    setBody('');
    setSent(true);
    await load();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="link" onPress={() => router.back()}>
          <Text style={styles.back}>‹ Cuenta y privacidad</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Ayuda y soporte
        </Text>
        <Text style={styles.secondary}>
          ¿Una emergencia? Usa el botón SOS dentro del servicio o llama al 105.
        </Text>

        <View style={styles.card}>
          <Text style={styles.h2}>Escríbenos</Text>
          <View style={styles.chips}>
            {(Object.keys(SUPPORT_CATEGORIES) as SupportCategory[]).map((c) => (
              <Pressable
                key={c}
                accessibilityRole="radio"
                accessibilityState={{ selected: c === category }}
                onPress={() => setCategory(c)}
                style={[styles.chip, c === category && styles.chipOn]}
              >
                <Text style={[styles.chipText, c === category && styles.chipTextOn]}>
                  {SUPPORT_CATEGORIES[c]}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            accessibilityLabel="Asunto"
            style={styles.input}
            value={subject}
            onChangeText={setSubject}
            placeholder="Asunto"
            placeholderTextColor={colors.textSecondary}
            maxLength={120}
          />
          <TextInput
            accessibilityLabel="Describe el problema"
            style={[styles.input, styles.multiline]}
            value={body}
            onChangeText={setBody}
            placeholder="Cuéntanos qué pasó"
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={3000}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          {sent && (
            <Text style={styles.ok}>
              Recibimos tu consulta. Te responderemos aquí y con una notificación.
            </Text>
          )}
          <Button label="Enviar" loading={busy} onPress={send} />
        </View>

        {tickets.map((t) => (
          <View key={t.id} style={styles.card} testID="ticket">
            <View style={styles.row}>
              <Text style={[styles.h2, styles.flex]}>{t.subject}</Text>
              <Text style={styles.badge}>{TICKET_STATUS_LABELS[t.status]}</Text>
            </View>
            <Text style={styles.secondary}>
              {SUPPORT_CATEGORIES[t.category]} · {timeAgo(t.created_at)}
            </Text>
            <Text style={styles.body}>{t.body}</Text>
            {t.staff_reply && (
              <View style={styles.reply}>
                <Text style={styles.label}>Respuesta de soporte</Text>
                <Text style={styles.body}>{t.staff_reply}</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 12 },
  flex: { flex: 1 },
  back: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.primary },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  secondary: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
  },
  h2: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.text },
  label: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.primary },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#D5D0C3',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.text },
  chipTextOn: { color: colors.surface },
  input: {
    minHeight: 48,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
  },
  multiline: { minHeight: 100, paddingTop: 12, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    color: colors.primary,
    backgroundColor: '#DCEFE8',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  reply: { backgroundColor: '#E7F0EC', borderRadius: radii.md, padding: 10, gap: 4 },
  error: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.danger },
  ok: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.primary },
});
