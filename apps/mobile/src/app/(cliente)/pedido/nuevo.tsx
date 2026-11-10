import {
  approxPointWkt,
  formatSoles,
  MAX_JOB_PRICE_CENTS,
  MIN_JOB_PRICE_CENTS,
  parseSolesToCents,
  tradePlural,
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

type Trade = Pick<Tables<'trades'>, 'id' | 'name' | 'pro_name'>;
const MAX_PHOTOS = 3;

export default function NuevoPedido() {
  const { trade: tradeParam } = useLocalSearchParams<{ trade?: string }>();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [address, setAddress] = useState('');
  const [reference, setReference] = useState('');
  const [price, setPrice] = useState('');
  const [hint, setHint] = useState<{ low: number; high: number } | null>(null);
  const [point, setPoint] = useState<Point | null>(null);
  const [locating, setLocating] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = Number(tradeParam);
    if (!Number.isInteger(id)) return;
    supabase
      .from('trades')
      .select('id, name, pro_name')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => setTrade(data));
    supabase.rpc('price_hint', { p_trade: id }).then(({ data }) => {
      const row = data?.[0];
      setHint(row ? { low: row.low_cents, high: row.high_cents } : null);
    });
    getCurrentPoint().then((p) => {
      setPoint(p);
      setLocating(false);
    });
  }, [tradeParam]);

  const priceCents = parseSolesToCents(price);

  async function addPhotos() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
    });
    if (!result.canceled) setPhotos((prev) => [...prev, ...result.assets].slice(0, MAX_PHOTOS));
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
          <Text style={styles.label} nativeID="price-label">
            Tu precio
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
          {hint && (
            <Text style={styles.secondary}>
              Rango habitual en tu zona: {formatSoles(hint.low)} – {formatSoles(hint.high)}
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
