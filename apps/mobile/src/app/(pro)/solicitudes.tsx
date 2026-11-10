import {
  approxPointWkt,
  distanceAndEta,
  formatRating,
  formatSoles,
  formatSolesShort,
  jobTitle,
} from '@cerquita/shared';
import { Link, router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { confirm } from '@/lib/confirm';
import type { NearbyJob } from '@/orders/types';
import { getCurrentPoint } from '@/lib/location';
import { supabase } from '@/lib/supabase';
import { usePolling } from '@/lib/use-polling';
import { colors, fonts, radii } from '@/theme';

type Status = {
  approvedTrades: string[];
  tradeNames: string[];
  online: boolean;
  radiusM: number;
  hasPresence: boolean;
};

export default function Solicitudes() {
  const [status, setStatus] = useState<Status | null>(null);
  const [jobs, setJobs] = useState<NearbyJob[]>([]);
  const [switching, setSwitching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession();
    const uid = session.session?.user.id;
    if (!uid) return;
    const [trades, presence, nearby] = await Promise.all([
      supabase
        .from('pro_trades')
        .select('status, trade:trades(name, pro_name)')
        .eq('pro_id', uid)
        .in('status', ['approved_observation', 'approved_full']),
      supabase.from('pro_presence').select('online, radius_m').eq('pro_id', uid).maybeSingle(),
      supabase.rpc('nearby_jobs'),
    ]);
    setStatus({
      approvedTrades: (trades.data ?? []).map((t) => t.trade?.pro_name ?? '').filter(Boolean),
      tradeNames: (trades.data ?? []).map((t) => t.trade?.name ?? '').filter(Boolean),
      online: presence.data?.online ?? false,
      radiusM: presence.data?.radius_m ?? 3000,
      hasPresence: presence.data !== null,
    });
    setJobs((nearby.data ?? []) as NearbyJob[]);
  }, []);

  usePolling(load, 10000);

  async function toggleOnline(next: boolean) {
    const { data: session } = await supabase.auth.getSession();
    const uid = session.session?.user.id;
    if (!uid || !status) return;
    setSwitching(true);
    setError(null);
    let lastPoint: string | undefined;
    if (next) {
      const point = await getCurrentPoint();
      if (!point) {
        setSwitching(false);
        setError('Para recibir pedidos cerca necesitamos tu ubicación mientras estés en línea.');
        return;
      }
      lastPoint = approxPointWkt(point.latitude, point.longitude);
    }
    const values = { online: next, ...(lastPoint ? { last_point: lastPoint } : {}) };
    const { error: saveError } = status.hasPresence
      ? await supabase.from('pro_presence').update(values).eq('pro_id', uid)
      : await supabase
          .from('pro_presence')
          .insert({ pro_id: uid, radius_m: status.radiusM, ...values });
    setSwitching(false);
    if (saveError) setError('No pudimos cambiar tu estado. Intenta de nuevo.');
    await load();
  }

  async function acceptPrice(job: NearbyJob) {
    const ok = await confirm(
      `¿Aceptar ${formatSolesShort(job.offered_price_cents)}?`,
      'Le enviaremos tu oferta al cliente con su mismo precio.',
      'Enviar',
    );
    if (!ok) return;
    setBusy(job.id);
    const { error: offerError } = await supabase
      .from('offers')
      .insert({ job_id: job.id, price_cents: job.offered_price_cents });
    setBusy(null);
    if (offerError)
      setError('No pudimos enviar tu oferta. Puede que el pedido ya no esté disponible.');
    await load();
  }

  async function withdraw(job: NearbyJob) {
    if (!job.my_offer_id) return;
    const ok = await confirm('¿Retirar tu oferta?', 'El cliente dejará de verla.', 'Retirar');
    if (!ok) return;
    await supabase.from('offers').update({ status: 'withdrawn' }).eq('id', job.my_offer_id);
    await load();
  }

  if (!status) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const tradesLabel = status.approvedTrades.join(' · ');

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.kicker}>Modo profesional</Text>
          <View style={styles.links}>
            <Link href="/oficios" style={styles.link}>
              Mis oficios
            </Link>
            <Link href="/ajustes" style={styles.link}>
              Cuenta
            </Link>
          </View>
        </View>

        {status.approvedTrades.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.h2}>Aún no tienes oficios aprobados</Text>
            <Text style={styles.body}>
              Cuando verifiquemos un oficio podrás ponerte en línea y ver pedidos cerca.
            </Text>
            <Button
              variant="outline"
              label="Ver mis oficios"
              onPress={() => router.push('/oficios')}
            />
          </View>
        ) : (
          <>
            <View style={[styles.card, styles.onlineRow]}>
              <View style={styles.flex}>
                <Text style={styles.h2}>
                  {tradesLabel} · {status.online ? 'En línea' : 'Desconectado'}
                </Text>
                <Text style={styles.secondary}>
                  {status.online
                    ? `Recibes pedidos hasta ${status.radiusM / 1000} km. Tu ubicación solo la usa el servidor.`
                    : 'Ponte en línea para ver pedidos cerca de ti.'}
                </Text>
              </View>
              <Switch
                accessibilityLabel="En línea"
                value={status.online}
                disabled={switching}
                onValueChange={toggleOnline}
                trackColor={{ true: colors.primary, false: '#D5D0C3' }}
              />
            </View>

            <Text style={styles.title} accessibilityRole="header">
              Solicitudes cerca de ti
            </Text>
            <Text style={styles.secondary}>
              {status.online
                ? jobs.length === 0
                  ? 'No hay pedidos nuevos en tu zona por ahora.'
                  : `${jobs.length} ${jobs.length === 1 ? 'pedido' : 'pedidos'} de ${status.tradeNames.join(' y ').toLowerCase()} en tu zona`
                : 'Estás desconectado.'}
            </Text>
          </>
        )}

        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}

        {jobs.map((job) => (
          <View key={job.id} style={styles.card} testID="solicitud">
            <View style={styles.jobHeader}>
              <View style={styles.flex}>
                <Text style={styles.jobTitle}>{jobTitle(job.description)}</Text>
                <Text style={styles.secondary}>
                  {job.trade_name} · {distanceAndEta(job.distance_m, 'a')}
                </Text>
                <Text style={styles.secondary}>
                  {job.client_name} · {formatRating(job.client_rating)}
                </Text>
              </View>
              <View style={styles.priceCol}>
                <Text style={styles.price}>{formatSoles(job.offered_price_cents)}</Text>
                <Text style={styles.secondary}>precio del cliente</Text>
              </View>
            </View>
            {job.my_offer_status === 'pending' ? (
              <View style={styles.sent}>
                <Text style={[styles.body, styles.flex]}>
                  Oferta enviada: {formatSoles(job.my_offer_price_cents ?? 0)} · esperando al
                  cliente
                </Text>
                <Button variant="ghost" label="Retirar" onPress={() => withdraw(job)} />
              </View>
            ) : job.my_offer_status ? (
              <Text style={styles.secondary}>Tu oferta ya no está activa.</Text>
            ) : (
              <View style={styles.actions}>
                <Button
                  variant="outline"
                  label="Cotizar"
                  style={styles.flex}
                  onPress={() =>
                    router.push({ pathname: '/solicitudes/[id]/cotizar', params: { id: job.id } })
                  }
                />
                <Button
                  label={`Aceptar ${formatSolesShort(job.offered_price_cents)}`}
                  style={styles.flex}
                  loading={busy === job.id}
                  onPress={() => acceptPrice(job)}
                />
              </View>
            )}
          </View>
        ))}
        <Pressable accessibilityRole="button" onPress={load}>
          <Text style={[styles.link, styles.refresh]}>Actualizar</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, gap: 12 },
  flex: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  links: { flexDirection: 'row', gap: 16 },
  kicker: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.textSecondary },
  link: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.primary },
  refresh: { textAlign: 'center', paddingVertical: 8 },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text, marginTop: 4 },
  h2: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
  secondary: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
  },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  jobHeader: { flexDirection: 'row', gap: 12 },
  jobTitle: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.text },
  priceCol: { alignItems: 'flex-end' },
  price: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  actions: { flexDirection: 'row', gap: 8 },
  sent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E7F0EC',
    borderRadius: radii.md,
    paddingLeft: 12,
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
