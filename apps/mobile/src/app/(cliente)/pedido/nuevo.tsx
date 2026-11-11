import {
  approxPointWkt,
  formatSoles,
  MAX_JOB_PRICE_CENTS,
  MIN_JOB_PRICE_CENTS,
  parseSolesToCents,
  MAX_VIDEO_SECONDS,
  PRICING_UNIT_LABELS,
  TEMP_VIDEO_NOTICE,
  tradePlural,
  unitPriceLabel,
  type PricingUnit,
  type RateCard,
  type Tables,
} from '@cerquita/shared';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { getCurrentPoint, type Point } from '@/lib/location';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radii } from '@/theme';

type Trade = Pick<Tables<'trades'>, 'id' | 'name' | 'pro_name' | 'pricing_unit'>;
const MAX_PHOTOS = 3;

export default function NuevoPedido() {
  const { trade: tradeParam } = useLocalSearchParams<{ trade?: string }>();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [video, setVideo] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [diagnostic, setDiagnostic] = useState(false);
  const [diagnosticFee, setDiagnosticFee] = useState<number | null>(null);
  const [address, setAddress] = useState('');
  const [reference, setReference] = useState('');
  const [price, setPrice] = useState('');
  const [hint, setHint] = useState<{ low: number; high: number } | null>(null);
  const [rateCard, setRateCard] = useState<RateCard | null>(null);
  const [units, setUnits] = useState(4);
  const [point, setPoint] = useState<Point | null>(null);
  const [locating, setLocating] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = Number(tradeParam);
    if (!Number.isInteger(id)) return;
    supabase
      .from('trades')
      .select('id, name, pro_name, pricing_unit')
      .eq('id', id)
      .maybeSingle()
      .then(async ({ data }) => {
        setTrade(data);
        if (!data) return;
        setUnits(data.pricing_unit === 'day' ? 1 : 4);
        supabase.rpc('diagnostic_visit_fee').then(({ data: fee }) => setDiagnosticFee(fee ?? null));
        const { data: card } = await supabase
          .from('trade_rate_cards')
          .select('unit, min_cents, suggested_cents, max_cents, visit_fee_cents')
          .eq('trade_id', data.id)
          .eq('unit', data.pricing_unit)
          .maybeSingle();
        setRateCard(card ?? null);
      });
    supabase.rpc('price_hint', { p_trade: id }).then(({ data }) => {
      const row = data?.[0];
      setHint(row ? { low: row.low_cents, high: row.high_cents } : null);
    });
    getCurrentPoint().then((p) => {
      setPoint(p);
      setLocating(false);
    });
  }, [tradeParam]);

  const unit: PricingUnit = trade?.pricing_unit ?? 'job';
  const perUnitCents = parseSolesToCents(price);
  // Por hora o por día: el precio que escribe el cliente es por unidad; el total = precio × unidades.
  const priceCents = diagnostic
    ? diagnosticFee
    : perUnitCents === null
      ? null
      : perUnitCents * (unit === 'job' ? 1 : units);

  async function addPhotos() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
    });
    if (!result.canceled) setPhotos((prev) => [...prev, ...result.assets].slice(0, MAX_PHOTOS));
  }

  async function pickVideo() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: MAX_VIDEO_SECONDS,
      quality: 0.6,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if ((asset.duration ?? 0) > MAX_VIDEO_SECONDS * 1000 + 500) {
      setError(`El video debe durar como máximo ${MAX_VIDEO_SECONDS} segundos.`);
      return;
    }
    setVideo(asset);
  }

  async function publish() {
    setError(null);
    if (!trade) return;
    if (description.trim().length < 10)
      return setError('Cuéntanos un poco más qué pasó (mínimo 10 letras).');
    if (address.trim().length < 5)
      return setError('Escribe tu dirección para que el profesional llegue.');
    if (
      priceCents === null ||
      priceCents < MIN_JOB_PRICE_CENTS ||
      priceCents > MAX_JOB_PRICE_CENTS
    ) {
      return setError(
        `Pon un precio entre ${formatSoles(MIN_JOB_PRICE_CENTS)} y ${formatSoles(MAX_JOB_PRICE_CENTS)}.`,
      );
    }
    if (!point)
      return setError(
        'Necesitamos tu ubicación aproximada para encontrar profesionales cerca. Actívala e intenta de nuevo.',
      );

    setBusy(true);
    const exactAddress = [address.trim(), reference.trim()].filter(Boolean).join(' · ');
    const { data: job, error: insertError } = await supabase
      .from('jobs')
      .insert({
        trade_id: trade.id,
        description: description.trim(),
        offered_price_cents: priceCents,
        units: unit === 'job' ? 1 : units,
        diagnostic_visit: diagnostic,
        approx_point: approxPointWkt(point.latitude, point.longitude),
        exact_address: exactAddress,
      })
      .select('id')
      .single();
    if (insertError || !job) {
      setBusy(false);
      return setError('No pudimos publicar tu pedido. Revisa tu conexión e intenta de nuevo.');
    }

    // Fotos: se suben a job-photos/<pedido>/… y luego se guardan las rutas.
    const paths: string[] = [];
    for (const [i, asset] of photos.entries()) {
      const ext = (asset.mimeType?.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
      const path = `${job.id}/${i + 1}-${Date.now().toString(36)}.${ext}`;
      const body = await (await fetch(asset.uri)).arrayBuffer();
      const { error: upError } = await supabase.storage
        .from('job-photos')
        .upload(path, body, { contentType: asset.mimeType ?? 'image/jpeg' });
      if (!upError) paths.push(path);
    }
    if (paths.length > 0) await supabase.from('jobs').update({ photos: paths }).eq('id', job.id);

    // Diagnóstico exprés: video temporal (48 h) en temp_media/<pedido>/…
    if (video) {
      const ext = (video.mimeType?.split('/')[1] ?? 'mp4').replace('quicktime', 'mov');
      const path = `${job.id}/video-${Date.now().toString(36)}.${ext}`;
      const body = await (await fetch(video.uri)).arrayBuffer();
      const up = await supabase.storage
        .from('temp_media')
        .upload(path, body, { contentType: video.mimeType ?? 'video/mp4' });
      if (!up.error) {
        const seconds = Math.max(
          1,
          Math.round((video.duration ?? MAX_VIDEO_SECONDS * 1000) / 1000),
        );
        await supabase.rpc('attach_job_video', {
          p_job: job.id,
          p_path: path,
          p_seconds: Math.min(seconds, MAX_VIDEO_SECONDS),
        });
      }
    }

    setBusy(false);
    router.replace({ pathname: '/pedido/[id]/ofertas', params: { id: job.id } });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            onPress={() => router.back()}
          >
            <Text style={styles.back}>‹</Text>
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">
            Nuevo pedido
          </Text>
        </View>
        <Text style={styles.tradeChip}>{trade?.pro_name ?? '…'}</Text>

        <View style={styles.field}>
          <Text style={styles.label} nativeID="desc-label">
            ¿Qué pasó?
          </Text>
          <TextInput
            accessibilityLabelledBy="desc-label"
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="Ej. Se filtra agua debajo del lavadero de la cocina, gotea desde ayer."
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={2000}
          />
        </View>

        <View style={styles.photos}>
          {photos.map((p) => (
            <Image
              key={p.uri}
              source={{ uri: p.uri }}
              style={styles.photo}
              accessibilityLabel="Foto del pedido"
            />
          ))}
          {photos.length < MAX_PHOTOS && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Agregar foto"
              onPress={addPhotos}
              style={[styles.photo, styles.addPhoto]}
            >
              <Text style={styles.addPhotoText}>+ Foto</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.secondary}>Una foto ayuda al profesional a cotizar mejor.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Diagnóstico exprés por video (opcional)</Text>
          {video ? (
            <View style={styles.videoRow}>
              <Text style={[styles.secondary, styles.flex]}>
                🎥 Video de {Math.round((video.duration ?? 0) / 1000)} s · {TEMP_VIDEO_NOTICE}
              </Text>
              <Button variant="ghost" label="Quitar" onPress={() => setVideo(null)} />
            </View>
          ) : (
            <Button
              variant="outline"
              label={`Grabar o elegir video (máx. ${MAX_VIDEO_SECONDS} s)`}
              onPress={pickVideo}
            />
          )}
          <Text style={styles.secondary}>
            El profesional lo ve para cotizar desde su celular. Se borra a las 48 horas.
          </Text>
        </View>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: diagnostic }}
          onPress={() => setDiagnostic((d) => !d)}
          style={[styles.diagnostic, diagnostic && styles.diagnosticOn]}
        >
          <Text style={styles.label}>
            {diagnostic ? '☑' : '☐'} Visita de diagnóstico presencial
            {diagnosticFee !== null ? ` (${formatSoles(diagnosticFee)})` : ''}
          </Text>
          <Text style={styles.secondary}>
            El profesional va, revisa y te cotiza en el sitio. Si haces el trabajo con él, la visita
            se descuenta de la mano de obra.
          </Text>
        </Pressable>

        <View style={styles.field}>
          <Text style={styles.label} nativeID="addr-label">
            Dirección
          </Text>
          <TextInput
            accessibilityLabelledBy="addr-label"
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="Ej. Jr. Los Pinos 245"
            placeholderTextColor={colors.textSecondary}
            autoComplete="street-address"
            maxLength={200}
          />
          <TextInput
            accessibilityLabel="Referencia"
            style={styles.input}
            value={reference}
            onChangeText={setReference}
            placeholder="Dpto., piso o referencia (opcional)"
            placeholderTextColor={colors.textSecondary}
            maxLength={90}
          />
          <Text style={styles.secondary}>
            {locating
              ? 'Buscando tu ubicación aproximada…'
              : point
                ? 'Solo el profesional que aceptes verá tu dirección exacta.'
                : 'Activa tu ubicación para publicar: los profesionales ven solo tu zona aproximada.'}
          </Text>
        </View>

        <View style={styles.field}>
          {unit !== 'job' && (
            <View style={styles.unitsRow}>
              <Text style={[styles.label, styles.flex]}>
                ¿Cuántas {PRICING_UNIT_LABELS[unit].plural}?
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Menos"
                onPress={() => setUnits((u) => Math.max(1, u - 1))}
              >
                <Text style={styles.stepper}>−</Text>
              </Pressable>
              <Text
                style={styles.unitsValue}
                accessibilityLabel={`${units} ${PRICING_UNIT_LABELS[unit].plural}`}
              >
                {units}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Más"
                onPress={() => setUnits((u) => Math.min(31, u + 1))}
              >
                <Text style={styles.stepper}>+</Text>
              </Pressable>
            </View>
          )}
          <Text style={styles.label} nativeID="price-label">
            Tu precio {unit === 'job' ? '' : PRICING_UNIT_LABELS[unit].per}
          </Text>
          <View style={styles.priceRow}>
            <Text style={styles.currency}>S/</Text>
            <TextInput
              accessibilityLabelledBy="price-label"
              style={styles.priceInput}
              value={price}
              onChangeText={setPrice}
              placeholder="80"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
              maxLength={8}
            />
          </View>
          {rateCard ? (
            <Text style={styles.secondary}>
              Tarifa sugerida en Huancayo: {formatSoles(rateCard.min_cents)} –{' '}
              {formatSoles(rateCard.max_cents)} {PRICING_UNIT_LABELS[unit].per} (sugerido{' '}
              {formatSoles(rateCard.suggested_cents)}). Sin regateo: los profesionales cotizan
              dentro de este rango.
            </Text>
          ) : (
            hint && (
              <Text style={styles.secondary}>
                Rango habitual en tu zona: {formatSoles(hint.low)} – {formatSoles(hint.high)}
              </Text>
            )
          )}
          {unit !== 'job' && priceCents !== null && (
            <Text style={styles.total}>
              Total: {unitPriceLabel(priceCents, unit, units)} = {formatSoles(priceCents)}
            </Text>
          )}
          {rateCard && perUnitCents !== null && perUnitCents < rateCard.min_cents && (
            <Text style={styles.warn}>
              Está por debajo de la tarifa mínima ({formatSoles(rateCard.min_cents)}).
            </Text>
          )}
        </View>

        <View style={styles.note}>
          <Text style={styles.noteText}>
            Solo los {tradePlural(trade?.pro_name ?? 'profesional')} verificados de tu zona verán tu
            pedido. Podrán aceptar tu precio o proponerte otro.
          </Text>
        </View>

        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        <Button
          label="Buscar profesionales cerca"
          loading={busy}
          disabled={!trade}
          onPress={publish}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 14 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { fontSize: 32, color: colors.text, paddingRight: 4 },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  tradeChip: {
    alignSelf: 'flex-start',
    fontFamily: fonts.bodySemibold,
    fontSize: 14,
    color: colors.surface,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
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
  multiline: { minHeight: 96, paddingTop: 14, textAlignVertical: 'top' },
  photos: { flexDirection: 'row', gap: 8 },
  photo: { width: 84, height: 84, borderRadius: radii.md, backgroundColor: '#ECE8DD' },
  addPhoto: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D5D0C3',
  },
  addPhotoText: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.primary },
  secondary: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  flex: { flex: 1 },
  videoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  diagnostic: {
    borderWidth: 1.5,
    borderColor: '#D5D0C3',
    borderRadius: radii.md,
    padding: 12,
    gap: 4,
    backgroundColor: colors.surface,
  },
  diagnosticOn: { borderColor: colors.primary, backgroundColor: '#E7F0EC' },
  unitsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  stepper: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.primary,
    paddingHorizontal: 10,
  },
  unitsValue: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.text,
    minWidth: 28,
    textAlign: 'center',
  },
  total: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.text },
  warn: { fontFamily: fonts.bodyMedium, fontSize: 13, color: '#7A5A12' },
  priceRow: {
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
  priceInput: { flex: 1, minWidth: 0, fontFamily: fonts.display, fontSize: 28, color: colors.text },
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
