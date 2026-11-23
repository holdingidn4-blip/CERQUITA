import { receiptHtml, type Receipt } from '@cerquita/shared';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radii } from '@/theme';

/** Comprobante del servicio en PDF para compartir por WhatsApp (o imprimir en la web). */
export function ReceiptButton({ jobId }: { jobId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share() {
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('job_receipt', { p_job: jobId });
    if (rpcError || !data) {
      setBusy(false);
      setError('No pudimos armar el comprobante. Intenta de nuevo.');
      return;
    }
    const html = receiptHtml(data as unknown as Receipt);
    try {
      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Compartir comprobante',
            UTI: 'com.adobe.pdf',
          });
        }
      }
    } catch {
      setError('No pudimos crear el PDF en este teléfono.');
    }
    setBusy(false);
  }

  return (
    <View style={styles.box} testID="comprobante">
      <Button
        variant="outline"
        label="Compartir comprobante (PDF)"
        loading={busy}
        onPress={share}
      />
      <Text style={styles.hint}>
        Puedes enviarlo por WhatsApp. No es un comprobante de pago SUNAT.
      </Text>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

/** El cliente decide si las fotos del trabajo se muestran en el perfil del profesional (y puede retirarlas). */
export function PortfolioToggle({ jobId }: { jobId: string }) {
  const [state, setState] = useState<{ count: number; allowed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('job_work_photos')
      .select('portfolio_allowed')
      .eq('job_id', jobId);
    const rows = data ?? [];
    setState({
      count: rows.length,
      allowed: rows.length > 0 && rows.every((r) => r.portfolio_allowed),
    });
  }, [jobId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!state || state.count === 0) return null;
  return (
    <View style={[styles.box, styles.row]} testID="portafolio">
      <View style={styles.flex}>
        <Text style={styles.title}>Mostrar fotos en el perfil del profesional</Text>
        <Text style={styles.hint}>
          Son las fotos de antes y después de tu trabajo. Puedes retirarlas cuando quieras.
        </Text>
      </View>
      <Switch
        accessibilityLabel="Permitir que las fotos se vean en el perfil del profesional"
        value={state.allowed}
        disabled={busy}
        onValueChange={async (value) => {
          setBusy(true);
          await supabase.rpc('set_portfolio_permission', { p_job: jobId, p_allowed: value });
          await load();
          setBusy(false);
        }}
        trackColor={{ true: colors.primary, false: '#D5D0C3' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 14,
    gap: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  title: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.text },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  error: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.danger },
});
