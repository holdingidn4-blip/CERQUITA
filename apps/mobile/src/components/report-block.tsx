import { REPORT_REASONS, type ReportReason } from '@cerquita/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { confirm } from '@/lib/confirm';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radii } from '@/theme';

/** “Reportar y bloquear” (App Store 1.2): reporta a soporte y bloquea chat, ofertas y pedidos entre ambos. */
export function ReportBlock({
  userId,
  name,
  jobId,
  onDone,
}: {
  userId: string;
  name: string;
  jobId?: string;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [details, setDetails] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function report() {
    const { error: e } = await supabase.rpc('report_user', {
      p_user: userId,
      p_reason: reason,
      p_details: details || undefined,
      p_job: jobId,
      p_block: true,
    });
    if (e) return setError(e.message);
    setDone(`Reportaste y bloqueaste a ${name}. Soporte revisará el caso.`);
    onDone?.();
  }

  async function blockOnly() {
    if (
      !(await confirm(
        `¿Bloquear a ${name}?`,
        'No podrán escribirse ni verse en pedidos nuevos.',
        'Bloquear',
      ))
    )
      return;
    const { error: e } = await supabase.rpc('block_user', { p_user: userId });
    if (e) return setError(e.message);
    setDone(`Bloqueaste a ${name}.`);
    onDone?.();
  }

  if (done) return <Text style={styles.done}>{done}</Text>;
  if (!open) {
    return (
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)}>
        <Text style={styles.link}>Reportar o bloquear a {name}</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.box} testID="reportar">
      <Text style={styles.title}>Reportar a {name}</Text>
      {(Object.keys(REPORT_REASONS) as ReportReason[]).map((r) => (
        <Pressable
          key={r}
          accessibilityRole="radio"
          accessibilityState={{ selected: reason === r }}
          onPress={() => setReason(r)}
          style={[styles.option, reason === r && styles.optionOn]}
        >
          <Text style={styles.body}>{REPORT_REASONS[r]}</Text>
        </Pressable>
      ))}
      <TextInput
        accessibilityLabel="Detalles del reporte"
        style={styles.input}
        value={details}
        onChangeText={setDetails}
        placeholder="Cuéntanos qué pasó (opcional)"
        placeholderTextColor={colors.textSecondary}
        multiline
        maxLength={1000}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Button variant="danger" label="Reportar y bloquear" onPress={report} />
      <Button variant="ghost" label="Solo bloquear" onPress={blockOnly} />
      <Button variant="ghost" label="Cancelar" onPress={() => setOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  link: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
    paddingVertical: 8,
  },
  box: { gap: 8, backgroundColor: colors.dangerSoft, borderRadius: radii.lg, padding: 14 },
  title: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.text },
  option: {
    padding: 10,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionOn: { borderColor: colors.danger, borderWidth: 1.5 },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.text },
  input: {
    minHeight: 70,
    padding: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
    textAlignVertical: 'top',
  },
  error: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.danger },
  done: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 8,
  },
});
