import {
  debtMessage,
  debtState,
  formatEntryAmount,
  formatSoles,
  PROOF_STATUS_LABELS,
  WALLET_ENTRY_LABELS,
  type PaymentProofStatus,
  type WalletEntryType,
} from '@cerquita/shared';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { supabase } from '@/lib/supabase';
import { usePolling } from '@/lib/use-polling';
import { useDebt } from '@/pro/use-debt';
import { colors, fonts, radii } from '@/theme';

type Entry = {
  id: string;
  type: WalletEntryType;
  amount_cents: number;
  balance_after_cents: number;
  created_at: string;
};
type Proof = {
  id: string;
  amount_cents: number;
  status: PaymentProofStatus;
  created_at: string;
  review_note: string | null;
};

/** Pantalla 14: comisión pendiente, límite y movimientos del libro (solo lectura). */
export default function Comision() {
  const { debt } = useDebt();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [proofs, setProofs] = useState<Proof[]>([]);

  const load = useCallback(async () => {
    const [e, p] = await Promise.all([
      supabase
        .from('wallet_entries')
        .select('id, type, amount_cents, balance_after_cents, created_at')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('payment_proofs')
        .select('id, amount_cents, status, created_at, review_note')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);
    setEntries(e.data ?? []);
    setProofs(p.data ?? []);
  }, []);
  usePolling(load, 15000);

  const state = debt ? debtState(debt) : 'ok';
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="link" onPress={() => router.replace('/solicitudes')}>
          <Text style={styles.back}>‹ Solicitudes</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Mi comisión
        </Text>
        <View
          style={[
            styles.card,
            state === 'paused' && styles.cardDanger,
            state === 'grace' && styles.cardWarn,
          ]}
        >
          <Text style={styles.secondary}>Comisión pendiente</Text>
          <Text style={styles.big}>{formatSoles(debt?.pendingCents ?? 0)}</Text>
          <Text style={styles.secondary}>Límite {formatSoles(debt?.limitCents ?? 0)}</Text>
          {debt && <Text style={styles.body}>{debtMessage(debt)}</Text>}
        </View>
        <Text style={styles.note}>
          La comisión es un porcentaje de cada trabajo confirmado. El cliente te paga a ti
          directamente; aquí solo se anota lo que le debes a Cerquita.
        </Text>
        {(debt?.pendingCents ?? 0) > 0 && (
          <Button label="Pagar comisión" onPress={() => router.push('/comision/pagar')} />
        )}

        {proofs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.h2}>Constancias enviadas</Text>
            {proofs.map((p) => (
              <View key={p.id} style={styles.row}>
                <Text style={[styles.body, styles.flex]}>{formatSoles(p.amount_cents)}</Text>
                <Text style={styles.secondary}>
                  {PROOF_STATUS_LABELS[p.status]}
                  {p.review_note ? ` · ${p.review_note}` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.h2}>Movimientos</Text>
          {entries.length === 0 && <Text style={styles.secondary}>Aún no tienes movimientos.</Text>}
          {entries.map((e) => (
            <View key={e.id} style={styles.row} testID="movimiento">
              <View style={styles.flex}>
                <Text style={styles.body}>{WALLET_ENTRY_LABELS[e.type]}</Text>
                <Text style={styles.secondary}>
                  {new Date(e.created_at).toLocaleDateString('es-PE')}
                </Text>
              </View>
              <Text style={[styles.amount, e.amount_cents > 0 && styles.credit]}>
                {formatEntryAmount(e.amount_cents)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 14 },
  flex: { flex: 1 },
  back: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.primary },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 6,
  },
  cardWarn: { backgroundColor: colors.amberSoft, borderColor: colors.amber },
  cardDanger: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  big: { fontFamily: fonts.display, fontSize: 34, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text },
  secondary: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  note: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
  },
  h2: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  amount: { fontFamily: fonts.display, fontSize: 16, color: colors.danger },
  credit: { color: colors.primary },
});
