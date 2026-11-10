import {
  distanceAndEta,
  formatRating,
  formatSoles,
  OFFER_KIND_LABEL,
  offerKind,
  tradePlural,
  type JobStatus,
} from '@cerquita/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { InitialsAvatar } from '@/components/initials-avatar';
import { confirm } from '@/lib/confirm';
import { supabase } from '@/lib/supabase';
import { usePolling } from '@/lib/use-polling';
import { colors, fonts, radii } from '@/theme';

type Offer = {
  id: string;
  pro_id: string;
  price_cents: number;
  message: string | null;
  pro_name: string;
  rating_avg: number | null;
  jobs_done: number;
  distance_m: number | null;
};
type Job = {
  id: string;
  status: JobStatus;
  offered_price_cents: number;
  trade: { pro_name: string } | null;
};

export default function Ofertas() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [j, o] = await Promise.all([
      supabase
        .from('jobs')
        .select('id, status, offered_price_cents, trade:trades(pro_name)')
        .eq('id', id)
        .maybeSingle(),
      supabase.rpc('job_offers', { p_job: id }),
    ]);
    if (j.data) {
      setJob(j.data as Job);
      if (!['published', 'with_offers', 'cancelled'].includes(j.data.status)) {
        router.replace({ pathname: '/servicio/[id]', params: { id } });
        return;
      }
    }
    setOffers(((o.data ?? []) as Offer[]).filter(Boolean));
  }, [id]);

  usePolling(load, 5000);

  async function accept(offer: Offer) {
    const ok = await confirm(
      `¿Contratar a ${offer.pro_name}?`,
      `Acuerdas ${formatSoles(offer.price_cents)}. Le pagas directo al terminar; verá tu dirección y podrán comunicarse.`,
      'Aceptar',
    );
    if (!ok) return;
    setBusy(offer.id);
    setError(null);
    const { error: acceptError } = await supabase.rpc('accept_offer', { p_offer: offer.id });
    setBusy(null);
    if (acceptError) {
      setError(acceptError.message);
      await load();
      return;
    }
    router.replace({ pathname: '/servicio/[id]', params: { id } });
  }

  async function cancel() {
    const ok = await confirm(
      '¿Cancelar el pedido?',
      'Los profesionales dejarán de verlo.',
      'Cancelar pedido',
    );
    if (!ok) return;
    await supabase.rpc('cancel_service', {
      p_job: id,
      p_reason: 'Cancelado por el cliente antes de aceptar',
    });
    router.replace('/inicio');
  }

  if (!job) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const trade = job.trade?.pro_name ?? 'profesional';
  const cancelled = job.status === 'cancelled';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="link" onPress={() => router.replace('/inicio')}>
          <Text style={styles.back}>‹ Inicio</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          {cancelled
            ? 'Pedido cancelado'
            : offers.length === 0
              ? `Buscando ${tradePlural(trade)} cerca…`
              : `${offers.length} ${tradePlural(trade, offers.length)} ${offers.length === 1 ? 'respondió' : 'respondieron'}`}
        </Text>
        <Text style={styles.secondary}>
          Solo {tradePlural(trade)} verificados · tu precio: {formatSoles(job.offered_price_cents)}
        </Text>

        {offers.length === 0 && !cancelled && (
          <View style={styles.waiting}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.body}>
              Te avisaremos aquí apenas alguien responda. Puedes salir de esta pantalla.
            </Text>
          </View>
        )}

        {offers.map((offer) => {
          const kind = offerKind(offer.price_cents, job.offered_price_cents);
          return (
            <View key={offer.id} style={styles.card} testID="oferta">
              <View style={styles.row}>
                <InitialsAvatar name={offer.pro_name} />
                <View style={styles.flex}>
                  <Text style={styles.name}>{offer.pro_name}</Text>
                  <Text style={styles.secondary}>
                    {formatRating(offer.rating_avg)} · {offer.jobs_done}{' '}
                    {offer.jobs_done === 1 ? 'trabajo' : 'trabajos'}
                  </Text>
                </View>
                <View style={styles.priceCol}>
                  <Text style={styles.price}>{formatSoles(offer.price_cents)}</Text>
                  <Text style={[styles.kind, kind === 'counter' && styles.kindCounter]}>
                    {OFFER_KIND_LABEL[kind]}
                  </Text>
                </View>
              </View>
              <View style={styles.row}>
                <Text style={[styles.secondary, styles.flex]}>
                  {distanceAndEta(offer.distance_m)}
                </Text>
                <Text style={styles.verified}>Verificado</Text>
              </View>
              {offer.message ? <Text style={styles.message}>“{offer.message}”</Text> : null}
              <View style={styles.actions}>
                <Button
                  variant="outline"
                  label="Ver perfil"
                  style={styles.flex}
                  onPress={() =>
                    router.push({
                      pathname: '/profesional/[id]',
                      params: { id: offer.pro_id, offer: offer.id, job: id },
                    })
                  }
                />
                <Button
                  label="Aceptar"
                  style={styles.flex}
                  loading={busy === offer.id}
                  onPress={() => accept(offer)}
                />
              </View>
            </View>
          );
        })}

        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        {!cancelled && <Button variant="ghost" label="Cancelar pedido" onPress={cancel} />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, gap: 12 },
  flex: { flex: 1 },
  back: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.primary },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  secondary: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text, flex: 1 },
  waiting: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: '#ECE8DD',
    borderRadius: radii.lg,
    padding: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.text },
  priceCol: { alignItems: 'flex-end' },
  price: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  kind: { fontFamily: fonts.bodySemibold, fontSize: 12, color: colors.primary },
  kindCounter: { color: '#7A5A12' },
  verified: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    color: colors.primary,
    backgroundColor: '#DCEFE8',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  message: { fontFamily: fonts.body, fontSize: 14, color: '#2F3B36', fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: 8 },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.md,
    padding: 12,
  },
});
