import { formatMoney } from '@cerquita/shared';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { supabase } from '@/lib/supabase';
import { BreakdownCard } from '@/service/breakdown-card';
import type { ServiceJob } from '@/service/use-service';
import { colors, fonts, radii } from '@/theme';

/** Alerta transparente para el cliente: el pro reevaluó en el sitio. */
export function ReevaluationAlert({
  job,
  proName,
  onAnswered,
}: {
  job: ServiceJob;
  proName: string;
  onAnswered: () => void;
}) {
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!job.reeval_receipt_path) return;
    supabase.storage
      .from('material-receipts')
      .createSignedUrl(job.reeval_receipt_path, 300)
      .then(({ data }) => setReceiptUrl(data?.signedUrl ?? null));
  }, [job.reeval_receipt_path]);

  async function answer(approve: boolean) {
    setBusy(approve ? 'yes' : 'no');
    const { error: e } = await supabase.rpc('answer_reevaluation', {
      p_job: job.id,
      p_approve: approve,
    });
    setBusy(null);
    if (e) return setError(e.message);
    onAnswered();
  }

  const labor = job.reeval_labor_cents ?? 0;
  const materials = job.reeval_materials_cents ?? 0;
  return (
    <View style={styles.wrap} accessibilityRole="alert" testID="alerta-reevaluacion">
      <Text style={styles.title}>{proName} reevaluó el trabajo en el sitio</Text>
      <Text style={styles.body}>
        Antes: {formatMoney(job.final_price_cents ?? 0, job.currency_code)} · Ahora:{' '}
        {formatMoney(labor + materials, job.currency_code)}
      </Text>
      <BreakdownCard
        laborCents={labor}
        materialsCents={materials}
        provider={job.reeval_materials_by ?? 'client'}
        items={job.reeval_items ?? []}
        currency={job.currency_code}
      />
      {receiptUrl && (
        <Button
          variant="ghost"
          label="Ver boleta de materiales"
          onPress={() => Linking.openURL(receiptUrl)}
        />
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      <Button
        label={`Aprobar ${formatMoney(labor + materials, job.currency_code)}`}
        loading={busy === 'yes'}
        onPress={() => answer(true)}
      />
      <Button
        variant="outline"
        label="Rechazar"
        loading={busy === 'no'}
        onPress={() => answer(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
    backgroundColor: colors.amberSoft,
    borderRadius: radii.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.amber,
  },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.text },
  error: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.danger },
});
