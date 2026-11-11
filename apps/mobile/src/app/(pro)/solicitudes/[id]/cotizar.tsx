import {
  commissionCents,
  distanceAndEta,
  formatRate,
  formatSoles,
  jobTitle,
  MAX_JOB_PRICE_CENTS,
  MIN_JOB_PRICE_CENTS,
  netCents,
  parseSolesToCents,
  isWithinRateCard,
  quoteSuggestions,
  rateCardSuggestions,
  unitPriceLabel,
  type RateCard,
} from '@cerquita/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { CautionBadge } from '@/components/caution-badge';
import { TempVideo } from '@/components/temp-video';
import { useSettingInt } from '@/lib/settings';
import { supabase } from '@/lib/supabase';
import type { NearbyJob } from '@/orders/types';
import { colors, fonts, radii } from '@/theme';

export default function Cotizar() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const rateBps = useSettingInt('commission_rate_bps');
  const [job, setJob] = useState<NearbyJob | null | undefined>(undefined);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [rateCard, setRateCard] = useState<RateCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('nearby_jobs').then(async ({ data }) => {
      const found = ((data ?? []) as NearbyJob[]).find((j) => j.id === id) ?? null;
      setJob(found);
      if (found) {
        const { data: card } = await supabase
          .from('trade_rate_cards')
          .select('unit, min_cents, suggested_cents, max_cents, visit_fee_cents')
          .eq('trade_id', found.trade_id)
          .eq('unit', found.pricing_unit)
          .maybeSingle();
        setRateCard(card ?? null);
      }
      if (found)
        setAmount(
          String(
            quoteSuggestions(found.offered_price_cents)[1] ?? found.offered_price_cents,
          ).replace(/00$/, ''),
        );
      if (found?.photos.length) {
        // Las fotos del pedido son privadas: URLs firmadas de corta vida.
        const { data: signed } = await supabase.storage
          .from('job-photos')
          .createSignedUrls(found.photos, 300);
        setPhotoUrls((signed ?? []).map((s) => s.signedUrl).filter((u): u is string => Boolean(u)));
      }
    });
  }, [id]);

  if (job === undefined || rateBps === null) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }
  if (job === null) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <Text style={styles.body}>Este pedido ya no está disponible.</Text>
        <Button
          variant="ghost"
          label="Volver a solicitudes"
          onPress={() => router.replace('/solicitudes')}
        />
      </SafeAreaView>
    );
  }

  const priceCents = parseSolesToCents(amount);
  const withinCard = priceCents !== null && isWithinRateCard(priceCents, rateCard, job.units);
  const valid =
    priceCents !== null &&
    priceCents >= MIN_JOB_PRICE_CENTS &&
    priceCents <= MAX_JOB_PRICE_CENTS &&
    withinCard;
  // Con tarifario: mínimo, sugerido y máximo × unidades (sin regateo); sin tarifario: las de siempre.
  const suggestions = rateCard
    ? [
        ...new Set([
          ...quoteSuggestions(job.offered_price_cents),
          ...rateCardSuggestions(rateCard, job.units),
        ]),
      ]
        .filter((c) => isWithinRateCard(c, rateCard, job.units))
        .sort((a, b) => a - b)
    : quoteSuggestions(job.offered_price_cents);

  async function send() {
    if (!job || !valid || priceCents === null) {
      setError(
        `Escribe un monto entre ${formatSoles(MIN_JOB_PRICE_CENTS)} y ${formatSoles(MAX_JOB_PRICE_CENTS)}.`,
      );
      return;
    }
    setBusy(true);
    setError(null);
    const { error: offerError } = await supabase
      .from('offers')
      .insert({ job_id: job.id, price_cents: priceCents, message: message.trim() || null });
    setBusy(false);
    if (offerError) {
      setError(
        offerError.code === '23505'
          ? 'Ya enviaste una oferta para este pedido.'
          : 'No pudimos enviar tu cotización. Puede que el pedido ya no esté disponible.',
      );
      return;
    }
    router.replace('/solicitudes');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.back}>‹ Responder pedido</Text>
        </Pressable>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={[styles.jobTitle, styles.flex]}>{jobTitle(job.description)}</Text>
            <View style={styles.priceCol}>
              <Text style={styles.price}>{formatSoles(job.offered_price_cents)}</Text>
              <Text style={styles.secondary}>el cliente ofrece</Text>
            </View>
          </View>
          {job.caution && <CautionBadge />}
          {job.diagnostic_visit && (
            <Text style={styles.secondary}>
              Visita de diagnóstico presencial: si el cliente hace el trabajo contigo, se descuenta
              de la mano de obra.
            </Text>
          )}
          {job.video_path && (
            <TempVideo
              path={job.video_path}
              seconds={job.video_seconds}
              expiresAt={job.video_expires_at}
            />
          )}
          {job.pricing_unit !== 'job' && (
            <Text style={styles.secondary}>
              {unitPriceLabel(job.offered_price_cents, job.pricing_unit, job.units)}
            </Text>
          )}
          {rateCard && (
            <Text style={styles.secondary}>
              Tarifario Huancayo: {formatSoles(rateCard.min_cents * job.units)} –{' '}
              {formatSoles(rateCard.max_cents * job.units)}
            </Text>
          )}
          <Text style={styles.body}>{job.description}</Text>
          {photoUrls.length > 0 && (
            <View style={styles.photos}>
              {photoUrls.map((uri) => (
                <Image
                  key={uri}
                  source={{ uri }}
                  style={styles.photo}
                  accessibilityLabel="Foto del pedido"
                />
              ))}
            </View>
          )}
          <Text style={styles.secondary}>
            {job.trade_name} · {distanceAndEta(job.distance_m, 'a')}
          </Text>
        </View>

        <Text style={styles.h2}>Tu cotización</Text>
        <View style={styles.chips}>
          {suggestions.map((cents) => {
            const on = priceCents === cents;
            return (
              <Pressable
                key={cents}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => setAmount(String(cents / 100))}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {formatSoles(cents).replace('.00', '')}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.amountRow}>
          <Text style={styles.currency}>S/</Text>
          <TextInput
            accessibilityLabel="Tu cotización en soles"
            style={styles.amountInput}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            maxLength={8}
          />
        </View>

        <View style={styles.card}>
          <Line
            label="Tu cotización"
            value={valid && priceCents !== null ? formatSoles(priceCents) : '—'}
          />
          <Line
            label={`Comisión de la app (${formatRate(rateBps)})`}
            value={
              valid && priceCents !== null
                ? `− ${formatSoles(commissionCents(priceCents, rateBps))}`
                : '—'
            }
          />
          <View style={styles.divider} />
          <Line
            label="Recibirás"
            value={valid && priceCents !== null ? formatSoles(netCents(priceCents, rateBps)) : '—'}
            strong
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label} nativeID="msg-label">
            Mensaje para el cliente (opcional)
          </Text>
          <TextInput
            accessibilityLabelledBy="msg-label"
            style={[styles.input, styles.multiline]}
            value={message}
            onChangeText={setMessage}
            placeholder="Ej. Llevo los repuestos, llego en 20 minutos."
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={500}
          />
        </View>

        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        <Button label="Enviar cotización" loading={busy} disabled={!valid} onPress={send} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.body, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.body, strong && styles.strongValue]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', padding: 20, gap: 12 },
  content: { padding: 20, gap: 14 },
  flex: { flex: 1 },
  back: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.primary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
  },
  row: { flexDirection: 'row', gap: 12 },
  jobTitle: { fontFamily: fonts.bodySemibold, fontSize: 17, color: colors.text },
  priceCol: { alignItems: 'flex-end' },
  price: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text },
  secondary: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  photos: { flexDirection: 'row', gap: 8 },
  photo: { width: 84, height: 84, borderRadius: radii.md, backgroundColor: '#ECE8DD' },
  h2: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.text },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#D5D0C3',
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.text },
  chipTextOn: { color: colors.surface },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    height: 64,
  },
  currency: { fontFamily: fonts.display, fontSize: 26, color: colors.text, marginRight: 6 },
  amountInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.text,
  },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  strong: { fontFamily: fonts.bodySemibold },
  strongValue: { fontFamily: fonts.display, fontSize: 18, color: colors.primary },
  divider: { height: 1, backgroundColor: '#F0EDE4' },
  field: { gap: 6 },
  label: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.text },
  input: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
  },
  multiline: { minHeight: 84, paddingTop: 14, textAlignVertical: 'top' },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.md,
    padding: 12,
  },
});
