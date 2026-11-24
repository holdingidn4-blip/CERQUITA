import {
  ACTIVE_SERVICE_STATUSES,
  formatLimaDateTime,
  formatSoles,
  jobTitle,
  SERVICE_LABELS,
  type JobStatus,
} from '@cerquita/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { colors, fonts, radii } from '@/theme';

type Job = {
  id: string;
  status: JobStatus;
  description: string;
  final_price_cents: number | null;
  created_at: string;
};

/** Pedidos del profesional: lo que está en curso arriba y su historial debajo. */
export default function Trabajos() {
  const [jobs, setJobs] = useState<Job[] | null>(null);

  const load = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession();
    const uid = session.session?.user.id;
    if (!uid) return;
    const { data } = await supabase
      .from('offers')
      .select('job:jobs!offers_job_id_fkey(id, status, description, final_price_cents, created_at)')
      .eq('pro_id', uid)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false })
      .limit(50);
    setJobs((data ?? []).map((o) => o.job).filter((j): j is Job => j !== null));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const active = (jobs ?? []).filter((j) => ACTIVE_SERVICE_STATUSES.includes(j.status));
  const past = (jobs ?? []).filter((j) => !ACTIVE_SERVICE_STATUSES.includes(j.status));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          Mis pedidos
        </Text>
        <Text style={styles.h2}>En curso</Text>
        {active.length === 0 && (
          <Text style={styles.empty}>
            No tienes servicios en curso. Cotiza pedidos cercanos desde Inicio.
          </Text>
        )}
        {active.map((j) => (
          <JobCard key={j.id} job={j} highlight />
        ))}
        <Text style={styles.h2}>Historial</Text>
        {jobs !== null && past.length === 0 && (
          <Text style={styles.empty}>Aquí verás tus trabajos terminados.</Text>
        )}
        {past.map((j) => (
          <JobCard key={j.id} job={j} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function JobCard({ job, highlight }: { job: Job; highlight?: boolean }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push({ pathname: '/trabajo/[id]', params: { id: job.id } })}
      style={({ pressed }) => [
        styles.card,
        highlight && styles.cardActive,
        pressed && styles.pressed,
      ]}
      testID="pedido-pro"
    >
      <View style={styles.row}>
        <Text style={[styles.badge, highlight && styles.badgeActive]}>
          {SERVICE_LABELS[job.status]}
        </Text>
        {job.final_price_cents ? (
          <Text style={styles.price}>{formatSoles(job.final_price_cents)}</Text>
        ) : null}
      </View>
      <Text style={styles.cardTitle}>{jobTitle(job.description)}</Text>
      <Text style={styles.secondary}>{formatLimaDateTime(job.created_at)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, gap: 10 },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.text },
  h2: { fontFamily: fonts.display, fontSize: 18, color: colors.text, marginTop: 10 },
  empty: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 14,
    gap: 6,
  },
  cardActive: { borderColor: colors.primary, borderWidth: 1.5 },
  pressed: { opacity: 0.85 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  badge: {
    fontFamily: fonts.bodySemibold,
    fontSize: 13,
    color: colors.textSecondary,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  badgeActive: { color: colors.primary, backgroundColor: colors.primarySoft },
  price: { fontFamily: fonts.display, fontSize: 17, color: colors.text },
  cardTitle: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.text },
  secondary: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary },
});
