import {
  distanceAndEta,
  formatDistance,
  formatRating,
  formatSoles,
  levelLabel,
  OFFER_KIND_LABEL,
  offerKind,
  tradePlural,
  type JobStatus,
  QUOTE_LINES,
  QUOTE_TERMS,
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
  eta_minutes: number | null;
  visit_cents: number | null;
  labor_cents: number | null;
  materials_cents: number | null;
  transport_cents: number | null;
  level: string;
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
    // Un solo botón "Acepto": el desglose y los términos ya están a la vista en la tarjeta.
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

        {offers.length > 0 && (
          <View style={styles.terms}>
            <Text style={styles.termsTitle}>
              Al tocar “Acepto” aceptas la cotización y estos términos:
            </Text>
            {QUOTE_TERMS.map((t) => (
              <Text key={t} style={styles.secondary}>
                • {t}
              </Text>
            ))}
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
                    {levelLabel(offer.level)} · {formatRating(offer.rating_avg)} · {offer.jobs_done}{' '}
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
                  {offer.eta_minutes
                    ? [formatDistance(offer.distance_m), `llega en ${offer.eta_minutes} min`]
                        .filter(Boolean)
                        .join(' · ')
                    : distanceAndEta(offer.distance_m)}
                </Text>
                <Text style={styles.verified}>Verificado</Text>
              </View>
              {offer.message ? <Text style={styles.message}>“{offer.message}”</Text> : null}
              <View style={styles.breakdown} testID="desglose-oferta">
                {QUOTE_LINES.map(({ key, label }) => {
                  const value =
                    (offer[`${key}_cents` as const] ?? (key === 'labor' ? offer.price_cents : 0)) ||
                    0;
                  return value > 0 ? (
                    <View key={key} style={styles.row}>
                      <Text style={[styles.secondary, styles.flex]}>{label}</Text>
                      <Text style={styles.secondary}>{formatSoles(value)}</Text>
                    </View>
                  ) : null;
                })}
              </View>
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
                  label="Acepto"
                  accessibilityHint="Aceptas esta cotización y sus términos. Quedan guardados el monto, la fecha y la hora."
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
  breakdown: { gap: 2, borderTopWidth: 1, borderTopColor: colors.surfaceMuted, paddingTop: 8 },
  terms: { gap: 4, backgroundColor: colors.surfaceMuted, borderRadius: 12, padding: 12 },
  termsTitle: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.text },
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
    backgroundColor: colors.surfaceMuted,
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
  kindCounter: { color: colors.warningText },
  verified: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  message: { fontFamily: fonts.body, fontSize: 14, color: colors.text, fontStyle: 'italic' },
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
