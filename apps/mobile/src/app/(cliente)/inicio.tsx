import {
  approxPointWkt,
  CATEGORY_LABELS,
  formatSoles,
  TRADE_CATEGORIES,
  type JobStatus,
  type Tables,
} from '@cerquita/shared';
import { Link, router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { MapPreview } from '@/components/map-preview';
import { TradeIcon } from '@/components/trade-icon';
import { getCurrentPoint, type Point } from '@/lib/location';
import { supabase } from '@/lib/supabase';
import { usePolling } from '@/lib/use-polling';
import { colors, fonts, radii } from '@/theme';

type Trade = Pick<Tables<'trades'>, 'id' | 'slug' | 'name' | 'pro_name' | 'category'>;
type MyJob = {
  id: string;
  trade_id: number;
  description: string;
  offered_price_cents: number;
  status: JobStatus;
};

const ACTIVE: JobStatus[] = [
  'published',
  'with_offers',
  'accepted',
  'on_the_way',
  'at_home',
  'finished',
];
const STATUS_TEXT: Partial<Record<JobStatus, string>> = {
  published: 'Buscando profesionales',
  with_offers: 'Tienes ofertas',
  accepted: 'Oferta aceptada',
  on_the_way: 'En camino',
  at_home: 'En tu domicilio',
  finished: 'Confirma el monto',
};
const SEARCH_RADIUS_M = 3000;
const TRUST = ['Verificados por oficio', 'Pagas al terminar', 'Sin adelantos'];
/** Minúsculas y sin tildes, para buscar “gasfitería” escribiendo “gasfiteria”. */
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export default function Inicio() {
  const [point, setPoint] = useState<Point | null>(null);
  const [asked, setAsked] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [nearby, setNearby] = useState<Map<number, number>>(new Map());
  const [jobs, setJobs] = useState<MyJob[]>([]);
  const [points, setPoints] = useState(0);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession();
    const uid = session.session?.user.id;
    const [t, j] = await Promise.all([
      supabase
        .from('trades')
        .select('id, slug, name, pro_name, category')
        .eq('active', true)
        .order('id'),
      uid
        ? supabase
            .from('jobs')
            .select('id, trade_id, description, offered_price_cents, status')
            .eq('client_id', uid)
            .in('status', ACTIVE)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as MyJob[] }),
    ]);
    setTrades(t.data ?? []);
    supabase.rpc('my_points').then(({ data }) => setPoints(data ?? 0));
    setJobs((j.data ?? []) as MyJob[]);
    if (point) {
      const { data } = await supabase.rpc('nearby_pros_summary', {
        p_point: approxPointWkt(point.latitude, point.longitude),
        p_radius_m: SEARCH_RADIUS_M,
      });
      setNearby(new Map((data ?? []).map((r) => [r.trade_id, r.pros])));
    }
  }, [point]);

  usePolling(load, 20000);

  async function locate() {
    setAsked(true);
    setPoint(await getCurrentPoint());
  }

  const total = [...nearby.values()].reduce((a, b) => a + b, 0);
  const tradeName = (id: number) => trades.find((t) => t.id === id)?.pro_name ?? '';

  function pick(trade: Trade) {
    router.push({ pathname: '/pedido/nuevo', params: { trade: String(trade.id) } });
  }

  const q = normalize(query.trim());
  const matches = q ? trades.filter((t) => normalize(`${t.name} ${t.pro_name}`).includes(q)) : [];

  const tile = (trade: Trade) => (
    <Pressable
      key={trade.id}
      accessibilityRole="button"
      accessibilityLabel={`Pedir ${trade.pro_name}`}
      onPress={() => pick(trade)}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
    >
      <View style={styles.tileIcon}>
        <TradeIcon slug={trade.slug} />
      </View>
      <Text style={styles.tileText} numberOfLines={2}>
        {trade.pro_name}
      </Text>
      {nearby.get(trade.id) ? (
        <Text style={styles.tileCount}>{nearby.get(trade.id)} cerca</Text>
      ) : null}
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <Text style={styles.brand}>Cerquita</Text>
          <View style={styles.topActions}>
            <Text style={styles.points} testID="mis-puntos">
              ★ {points} pts
            </Text>
            <Link href="/ajustes" style={styles.link}>
              Cuenta
            </Link>
          </View>
        </View>

        {jobs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.h2}>Tus pedidos</Text>
            {jobs.map((job, index) => (
              <Pressable
                key={job.id}
                accessibilityRole="link"
                style={[styles.jobRow, index === 0 && styles.jobRowFirst]}
                onPress={() =>
                  router.push(
                    job.status === 'published' || job.status === 'with_offers'
                      ? { pathname: '/pedido/[id]/ofertas', params: { id: job.id } }
                      : { pathname: '/servicio/[id]', params: { id: job.id } },
                  )
                }
              >
                <View style={styles.flex}>
                  <Text style={[styles.jobStatus, index === 0 && styles.jobStatusFirst]}>
                    {STATUS_TEXT[job.status]}
                  </Text>
                  <Text style={styles.jobTitle} numberOfLines={1}>
                    {tradeName(job.trade_id)} · {job.description}
                  </Text>
                  <Text style={styles.secondary}>{formatSoles(job.offered_price_cents)}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.hero}>
          <Text style={styles.h1}>¿Qué necesitas hoy?</Text>
          <TextInput
            accessibilityLabel="Buscar un oficio"
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Busca: gasfitero, electricista, pintor…"
            placeholderTextColor={colors.textSecondary}
            returnKeyType="search"
            autoCorrect={false}
          />
          <View style={styles.trust}>
            {TRUST.map((label) => (
              <View key={label} style={styles.trustChip}>
                <Text style={styles.trustText}>✓ {label}</Text>
              </View>
            ))}
          </View>
          {point ? (
            <Text style={styles.nearbyLine}>
              {total === 0
                ? 'Aún no hay profesionales en línea cerca. Igual puedes publicar tu pedido.'
                : `${total} ${total === 1 ? 'profesional verificado' : 'profesionales verificados'} a menos de 3 km`}
            </Text>
          ) : (
            <View style={styles.nearbyCard}>
              <Text style={styles.body}>
                {asked
                  ? 'No pudimos ver tu ubicación. Puedes pedir igual: escribirás tu dirección en el pedido.'
                  : 'Usa tu ubicación para ver profesionales verificados cerca de ti.'}
              </Text>
              {!asked && <Button variant="outline" label="Usar mi ubicación" onPress={locate} />}
            </View>
          )}
        </View>

        {q ? (
          <View style={styles.section}>
            {matches.length === 0 ? (
              <Text style={styles.secondary}>
                No encontramos “{query.trim()}”. Prueba con otra palabra o elige un oficio de la
                lista.
              </Text>
            ) : (
              <View style={styles.grid}>{matches.map(tile)}</View>
            )}
          </View>
        ) : (
          TRADE_CATEGORIES.map((category) => {
            const list = trades.filter((t) => t.category === category);
            if (list.length === 0) return null;
            return (
              <View key={category} style={styles.section}>
                <Text style={styles.h2}>{CATEGORY_LABELS[category]}</Text>
                <View style={styles.grid}>{list.map(tile)}</View>
              </View>
            );
          })
        )}

        {point && <MapPreview center={point} radiusM={SEARCH_RADIUS_M} />}
      </ScrollView>
    </SafeAreaView>
  );
}

const TINT = colors.primarySoft;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 22 },
  flex: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  brand: { fontFamily: fonts.display, fontSize: 24, color: colors.primary },
  points: {
    fontFamily: fonts.bodySemibold,
    fontSize: 13,
    color: colors.warningText,
    backgroundColor: colors.amberSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  link: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.primary },
  hero: { gap: 12 },
  h1: { fontFamily: fonts.display, fontSize: 26, lineHeight: 32, color: colors.text },
  h2: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.text },
  search: {
    height: 50,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.text,
  },
  trust: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  trustChip: {
    borderRadius: radii.pill,
    backgroundColor: TINT,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  trustText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.primary },
  section: { gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '31%',
    minHeight: 108,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    gap: 6,
  },
  tilePressed: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tileIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: TINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 13,
    lineHeight: 17,
    color: colors.text,
    textAlign: 'center',
  },
  tileCount: { fontFamily: fonts.bodySemibold, fontSize: 12, color: colors.primary },
  nearbyCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
    padding: 16,
    gap: 12,
  },
  nearbyLine: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.primary },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text },
  secondary: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  jobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  jobRowFirst: { borderColor: colors.primary, borderWidth: 1.5 },
  jobStatus: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  jobStatusFirst: { color: colors.primary },
  jobTitle: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.text },
  chevron: { fontSize: 22, color: colors.textSecondary },
});
