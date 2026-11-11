import { formatSoles, formatSolesShort, jobTitle } from '@cerquita/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { InitialsAvatar } from '@/components/initials-avatar';
import { OffAppWarning } from '@/components/off-app-warning';
import { BreakdownCard } from '@/service/breakdown-card';
import { supabase } from '@/lib/supabase';
import { useService } from '@/service/use-service';
import { colors, fonts, radii } from '@/theme';

/** Pantalla 11: el cliente aprueba el monto que marcó el profesional. */
export default function Confirmar() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, other, reload } = useService(id);
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState(0);
  const [applying, setApplying] = useState(false);
  useEffect(() => {
    supabase.rpc('my_points').then(({ data }) => setPoints(data ?? 0));
  }, []);

  if (!job) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const agreed = job.final_price_cents ?? 0;
  const proposed = job.final_proposed_cents ?? agreed;
  const same = agreed === proposed;
  const first = other?.name.split(' ')[0] ?? 'El profesional';

  async function answer(approve: boolean) {
    setBusy(approve ? 'yes' : 'no');
    setError(null);
    const { error: rpcError } = await supabase.rpc('confirm_job', {
      p_job: id,
      p_approve: approve,
    });
    setBusy(null);
    if (rpcError) return setError(rpcError.message);
    router.replace(
      approve
        ? { pathname: '/servicio/[id]/calificar', params: { id } }
        : { pathname: '/servicio/[id]', params: { id } },
    );
  }

  if (job.status !== 'finished') {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <Text style={styles.body}>No hay un monto por confirmar.</Text>
        <Button
          variant="ghost"
          label="Ver el servicio"
          onPress={() => router.replace({ pathname: '/servicio/[id]', params: { id } })}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          {first} marcó el trabajo como terminado
        </Text>
        <Text style={styles.secondary}>Revisa el trabajo y confirma el monto antes de pagar.</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <InitialsAvatar name={other?.name ?? null} />
            <View style={styles.flex}>
              <Text style={styles.name}>{other?.name}</Text>
              <Text style={styles.secondary}>
                {jobTitle(job.description)} · {job.trade?.pro_name}
              </Text>
            </View>
          </View>
          <Line label="Precio acordado" value={formatSoles(agreed)} />
          <Line label={`Monto que indica ${first}`} value={formatSoles(proposed)} strong />
          <Text style={[styles.badge, !same && styles.badgeWarn]}>
            {same
              ? 'Coincide con lo acordado'
              : `Cambió ${proposed > agreed ? '+' : '−'}${formatSoles(Math.abs(proposed - agreed))}`}
          </Text>
        </View>
        {job.materials_cents > 0 && (
          <BreakdownCard
            title="Desglose"
            laborCents={proposed - job.materials_cents}
            materialsCents={job.materials_cents}
            provider={job.materials_provided_by}
            items={job.materials_items}
            currency={job.currency_code}
          />
        )}
        {job.diagnostic_visit && (
          <Text style={styles.secondary}>
            La visita de diagnóstico ya está incluida: se descuenta de la mano de obra.
          </Text>
        )}
        <View style={styles.card} testID="puntos">
          <Text style={styles.name}>Puntos Cerquita: {points}</Text>
          {job.points_discount_cents > 0 ? (
            <Text style={styles.body}>
              Descuento aplicado: −{formatSoles(job.points_discount_cents)} ({job.points_redeemed}{' '}
              puntos). Cerquita se lo paga al profesional.
            </Text>
          ) : (
            <Button
              variant="outline"
              label="Usar mis puntos"
              loading={applying}
              disabled={points === 0}
              onPress={async () => {
                setApplying(true);
                const { error: e } = await supabase.rpc('apply_points', {
                  p_job: id,
                  p_points: points,
                });
                setApplying(false);
                if (e) setError(e.message);
                reload();
              }}
            />
          )}
          <Text style={styles.secondary}>
            Ganas 1 punto por cada S/ 1 de mano de obra en trabajos confirmados en la app.
          </Text>
        </View>
        <OffAppWarning />
        <View style={styles.note}>
          <Text style={styles.noteText}>
            Le pagas directamente a {first} en efectivo, Yape o Plin. Cerquita no recibe este pago.
          </Text>
        </View>
        <Text style={styles.secondary}>
          Si el monto cambió, {first} debe proponer el nuevo total y tú aprobarlo aquí. La garantía
          y tu calificación solo valen para trabajos confirmados en la app.
        </Text>
        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        <Button
          label={`Confirmar ${formatSolesShort(proposed - job.points_discount_cents)}`}
          loading={busy === 'yes'}
          onPress={() => answer(true)}
        />
        <Button
          variant="ghost"
          label={same ? 'El trabajo no está terminado' : 'No estoy de acuerdo con el monto'}
          loading={busy === 'no'}
          onPress={() => answer(false)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={styles.body}>{label}</Text>
      <Text style={[styles.body, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', padding: 20, gap: 12 },
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
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  body: { fontFamily: fonts.body, fontSize: 15, color: colors.text },
  strong: { fontFamily: fonts.display, fontSize: 18 },
  secondary: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  badge: {
    alignSelf: 'flex-start',
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    color: colors.primary,
    backgroundColor: '#DCEFE8',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  badgeWarn: { color: '#7A5A12', backgroundColor: colors.amberSoft },
  note: { backgroundColor: '#E7F0EC', borderRadius: radii.md, padding: 12 },
  noteText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.text },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.md,
    padding: 12,
  },
});
