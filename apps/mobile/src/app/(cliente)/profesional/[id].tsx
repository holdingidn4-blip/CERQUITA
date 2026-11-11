import { distanceAndEta, formatRating, formatSoles } from '@cerquita/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { InitialsAvatar } from '@/components/initials-avatar';
import { ReportBlock } from '@/components/report-block';
import { confirm } from '@/lib/confirm';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radii } from '@/theme';

type Profile = {
  full_name: string | null;
  trades: string[];
  rating_avg: number | null;
  ratings_count: number;
  jobs_done: number;
  review_stars: number | null;
  review_comment: string | null;
  review_author: string | null;
};
type OfferInfo = { id: string; price_cents: number; distance_m: number | null; pro_name: string };

export default function PerfilProfesional() {
  const {
    id,
    offer: offerId,
    job: jobId,
  } = useLocalSearchParams<{ id: string; offer?: string; job?: string }>();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [offer, setOffer] = useState<OfferInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .rpc('pro_profile', { p_pro: id })
      .then(({ data }) => setProfile((data?.[0] as Profile) ?? null));
    if (jobId && offerId) {
      supabase.rpc('job_offers', { p_job: jobId }).then(({ data }) => {
        const match = (data ?? []).find((o) => o.id === offerId && o.status === 'pending');
        setOffer(match ? (match as OfferInfo) : null);
      });
    }
  }, [id, jobId, offerId]);

  async function hire() {
    if (!offer || !jobId) return;
    const ok = await confirm(
      `¿Contratar a ${offer.pro_name}?`,
      `Acuerdas ${formatSoles(offer.price_cents)}.`,
      'Aceptar',
    );
    if (!ok) return;
    setBusy(true);
    const { error: acceptError } = await supabase.rpc('accept_offer', { p_offer: offer.id });
    setBusy(false);
    if (acceptError) return setError(acceptError.message);
    router.replace({ pathname: '/servicio/[id]', params: { id: jobId } });
  }

  if (profile === undefined) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }
  if (profile === null) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <Text style={styles.body}>Este perfil no está disponible.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.back}>‹ Perfil del profesional</Text>
        </Pressable>
        <View style={styles.header}>
          <InitialsAvatar name={profile.full_name} size={72} />
          <Text style={styles.name}>{profile.full_name}</Text>
          <Text style={styles.secondary}>{profile.trades.join(' · ')}</Text>
          <Text style={styles.verified}>Identidad verificada</Text>
        </View>
        <View style={styles.stats}>
          <Stat value={formatRating(profile.rating_avg)} label="Calificación" />
          <Stat value={String(profile.jobs_done)} label="Trabajos" />
          <Stat value={String(profile.ratings_count)} label="Reseñas" />
        </View>
        {profile.review_comment && (
          <View style={styles.card}>
            <Text style={styles.h2}>Reseña reciente</Text>
            <Text style={styles.secondary}>
              {profile.review_author} · {'★'.repeat(profile.review_stars ?? 0)}
            </Text>
            <Text style={styles.body}>{profile.review_comment}</Text>
          </View>
        )}
        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        {profile.full_name && (
          <ReportBlock
            userId={id}
            name={profile.full_name.split(' ')[0] ?? 'este profesional'}
            jobId={jobId}
          />
        )}
        {offer && (
          <View style={styles.footer}>
            <View>
              <Text style={styles.price}>{formatSoles(offer.price_cents)}</Text>
              <Text style={styles.secondary}>{distanceAndEta(offer.distance_m)}</Text>
            </View>
            <Button label="Aceptar y contratar" loading={busy} style={styles.flex} onPress={hire} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.secondary}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  content: { padding: 20, gap: 14 },
  flex: { flex: 1 },
  back: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.primary },
  header: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  name: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  secondary: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text },
  verified: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    color: colors.primary,
    backgroundColor: '#DCEFE8',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  stats: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
  },
  statValue: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 6,
  },
  h2: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.text },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  price: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.md,
    padding: 12,
  },
});
