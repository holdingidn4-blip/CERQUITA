import {
  breakdown,
  formatMoney,
  formatRate,
  MATERIALS_PROVIDER_LABELS,
  type MaterialItem,
  type MaterialsProvider,
} from '@cerquita/shared';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii } from '@/theme';

type Props = {
  title?: string;
  laborCents: number;
  materialsCents: number;
  provider: MaterialsProvider;
  items: MaterialItem[];
  currency: string;
  /** Si se pasa, muestra la comisión (solo mano de obra) y lo que recibe el pro. */
  rateBps?: number | null;
};

export function BreakdownCard({
  title,
  laborCents,
  materialsCents,
  provider,
  items,
  currency,
  rateBps,
}: Props) {
  const b = breakdown(laborCents, materialsCents, rateBps ?? 0);
  return (
    <View style={styles.card} testID="desglose">
      {title && <Text style={styles.title}>{title}</Text>}
      <Line label="Mano de obra" value={formatMoney(b.laborCents, currency)} />
      <Line
        label={`Materiales · ${MATERIALS_PROVIDER_LABELS[provider]}`}
        value={formatMoney(b.materialsCents, currency)}
      />
      {items.map((it, i) => (
        <Text key={`${it.name}-${i}`} style={styles.item}>
          {it.qty} × {it.name}
          {it.store ? ` (${it.store})` : ''} · {formatMoney(it.qty * it.unit_cents, currency)}
        </Text>
      ))}
      <View style={styles.divider} />
      <Line label="Total" value={formatMoney(b.totalCents, currency)} strong />
      {rateBps != null && (
        <>
          <Line
            label={`Comisión (${formatRate(rateBps)} solo de mano de obra)`}
            value={`− ${formatMoney(b.commissionCents, currency)}`}
          />
          <Line label="Recibes" value={formatMoney(b.proReceivesCents, currency)} strong />
          <Text style={styles.note}>Los materiales no pagan comisión.</Text>
        </>
      )}
    </View>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.label, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.value, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
  },
  title: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.text },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  label: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text },
  value: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  strong: { fontFamily: fonts.display, fontSize: 17 },
  item: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, paddingLeft: 8 },
  divider: { height: 1, backgroundColor: '#F0EDE4' },
  note: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
});
