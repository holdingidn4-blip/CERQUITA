import { approxPointWkt, formatSoles, type JobStatus, type Tables } from '@cerquita/shared';
import { Link, router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { MapPreview } from '@/components/map-preview';
import { getCurrentPoint, type Point } from '@/lib/location';
import { supabase } from '@/lib/supabase';
import { usePolling } from '@/lib/use-polling';
import { colors, fonts, radii } from '@/theme';

type Trade = Pick<Tables<'trades'>, 'id' | 'slug' | 'name' | 'pro_name'>;
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

export default function Inicio() {
  const [point, setPoint] = useState<Point | null>(null);
  const [asked, setAsked] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [nearby, setNearby] = useState<Map<number, number>>(new Map());
  const [jobs, setJobs] = useState<MyJob[]>([]);

  const load = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession();
    const uid = session.session?.user.id;
    const [t, j] = await Promise.all([
      supabase.from('trades').select('id, slug, name, pro_name').eq('active', true).order('id'),
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

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.brand}>Cerquita</Text>
          <Link href="/ajustes" style={styles.link}>
            Cuenta
          </Link>
        </View>

        {point ? (
          <MapPreview center={point} radiusM={SEARCH_RADIUS_M} />
        ) : (
          <View style={styles.locate}>
            <Text style={styles.body}>
              {asked
                ? 'No pudimos ver tu ubicación. Puedes pedir igual: escribirás tu dirección en el pedido.'
                : 'Usa tu ubicación para ver profesionales verificados cerca de ti.'}
            </Text>
            {!asked && <Button variant="outline" label="Usar mi ubicación" onPress={locate} />}
          </View>
        )}

        {jobs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.h2}>Tus pedidos</Text>
            {jobs.map((job) => (
              <Pressable
                key={job.id}
                accessibilityRole="link"
                style={styles.jobRow}
                onPress={() =>
                  router.push(
                    job.status === 'published' || job.status === 'with_offers'
                      ? { pathname: '/pedido/[id]/ofertas', params: { id: job.id } }
                      : { pathname: '/servicio/[id]', params: { id: job.id } },
                  )
                }
              >
                <View style={styles.flex}>
                  <Text style={styles.jobTitle} numberOfLines={1}>
                    {tradeName(job.trade_id)} · {job.description}
                  </Text>
                  <Text style={styles.secondary}>
                    {STATUS_TEXT[job.status]} · {formatSoles(job.offered_price_cents)}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.h1}>¿Qué necesitas hoy?</Text>
          <View style={styles.grid}>
            {trades.map((trade) => (
              <Pressable
                key={trade.id}
                accessibilityRole="button"
                accessibilityLabel={`Pedir ${trade.pro_name}`}
                onPress={() => pick(trade)}
                style={styles.tile}
              >
                <Text style={styles.tileText}>{trade.pro_name}</Text>
                {nearby.get(trade.id) ? (
                  <Text style={styles.tileCount}>{nearby.get(trade.id)} cerca</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
          {point && (
            <Text style={styles.secondary}>
              {total === 0
                ? 'Aún no hay profesionales en línea cerca. Igual puedes publicar tu pedido.'
                : `${total} ${total === 1 ? 'profesional verificado' : 'profesionales verificados'} a menos de 3 km`}
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 18 },
  flex: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { fontFamily: fonts.display, fontSize: 24, color: colors.primary },
  link: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.primary },
  locate: { backgroundColor: '#ECE8DD', borderRadius: 20, padding: 20, gap: 12 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text },
  section: { gap: 10 },
  h1: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  h2: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    width: '31.5%',
    minHeight: 76,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    gap: 4,
  },
  tileText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
  },
  tileCount: { fontFamily: fonts.body, fontSize: 12, color: colors.primary },
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
  jobTitle: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.text },
  chevron: { fontSize: 22, color: colors.textSecondary },
});
