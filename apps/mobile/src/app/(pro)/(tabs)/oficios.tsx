import {
  describeMissing,
  observationProgress,
  proTradeView,
  stepOfRequirement,
  type Tone,
} from '@cerquita/shared';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { isEditable, useVerification } from '@/pro/use-verification';
import { colors, fonts, radii } from '@/theme';

const TONES: Record<Tone, { bg: string; fg: string }> = {
  success: { bg: colors.primarySoft, fg: colors.primary },
  info: { bg: colors.infoSoft, fg: colors.infoText },
  warning: { bg: colors.amberSoft, fg: colors.warningText },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  neutral: { bg: colors.surfaceMuted, fg: colors.text },
};

/** Estado de la verificación: qué se aprobó por oficio, qué está en revisión y qué falta. */
export default function Oficios() {
  const { data, error, load } = useVerification();
  const [refreshing, setRefreshing] = useState(false);

  if (!data) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </SafeAreaView>
    );
  }

  const tradeName = (tradeId: number) => data.trades.find((t) => t.id === tradeId)?.pro_name ?? '';
  const minOf = (tradeId: number, item: string) =>
    data.requirements[tradeId]?.find((r) => r.requirement === item)?.min_count;
  const inReview = data.proTrades.filter(
    (t) => t.status === 'submitted' || t.status === 'in_review',
  );
  const approved = data.proTrades.filter(
    (t) => t.status === 'approved_observation' || t.status === 'approved_full',
  );
  const pending = data.proTrades.filter((t) => isEditable(t.status));
  const identityPending = pending.flatMap((t) =>
    t.missing.filter((m) => stepOfRequirement(m) === 'datos' || m === 'background'),
  );
  const needs = (item: string) => pending.some((t) => t.missing.includes(item));
  const needsBackground = data.proTrades.some((t) =>
    (data.requirements[t.tradeId] ?? []).some((r) => r.requirement === 'background'),
  );
  const hasVideo = data.documents.some((d) => d.kind === 'verification_video');
  // Progreso por pasos: identidad, antecedentes, oficios y video.
  const steps = [
    {
      key: 'identidad',
      title: 'Identidad',
      done:
        data.identityVerified ||
        (data.identity !== null &&
          !pending.some((t) => t.missing.some((m) => stepOfRequirement(m) === 'datos'))),
      detail: data.identityVerified
        ? 'DNI y selfie verificados'
        : 'DNI, fecha de nacimiento y selfie',
    },
    {
      key: 'antecedentes',
      title: 'Antecedentes',
      done: !needsBackground || (data.hasBackground && !needs('background')),
      detail: needsBackground ? 'Certificado para oficios de riesgo' : 'No lo pide tu oficio',
    },
    {
      key: 'oficios',
      title: 'Oficios',
      done: approved.length > 0 || inReview.length > 0,
      detail:
        approved.length > 0
          ? `Aprobado: ${approved.map((t) => tradeName(t.tradeId)).join(', ')}`
          : inReview.length > 0
            ? 'En revisión por el equipo'
            : 'Elige tus oficios y especialidades',
    },
    {
      key: 'video',
      title: 'Video',
      done: hasVideo && !needs('verification_video'),
      detail: 'De 1 a 3 minutos contando tu experiencia',
    },
  ];
  const nextStep = steps.findIndex((st) => !st.done);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <View style={styles.titleRow}>
          <Text style={styles.title} accessibilityRole="header">
            Tu verificación
          </Text>
          <Link href="/ajustes" style={styles.link}>
            Cuenta
          </Link>
        </View>

        <View style={styles.steps} testID="pasos-verificacion">
          {steps.map((st, i) => {
            const isNext = i === nextStep;
            return (
              <View
                key={st.key}
                style={[styles.stepRow, isNext && styles.stepNext]}
                accessible
                accessibilityLabel={`${st.title}: ${st.done ? 'completo' : isNext ? 'siguiente paso' : 'pendiente'}. ${st.detail}`}
              >
                <View style={[styles.stepCircle, st.done && styles.stepDone]}>
                  <Text style={[styles.stepMark, st.done && styles.stepMarkDone]}>
                    {st.done ? '✓' : i + 1}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.cardTitle}>
                    {st.title}
                    {isNext ? ' · siguiente paso' : ''}
                  </Text>
                  <Text style={styles.secondary}>{st.detail}</Text>
                </View>
              </View>
            );
          })}
          {nextStep !== -1 && pending.length > 0 && (
            <Button label="Continuar mi registro" onPress={() => router.push('/registro')} />
          )}
        </View>

        {inReview.length > 0 && (
          <View style={[styles.banner, { backgroundColor: TONES.info.bg }]} testID="aviso-revision">
            <Text style={styles.bannerTitle}>
              En revisión · te avisamos en {data.settings.reviewHours} h
            </Text>
            <Text style={styles.body}>
              {inReview.map((t) => tradeName(t.tradeId)).join(', ')}. No necesitas hacer nada más
              por ahora.
            </Text>
          </View>
        )}
        {approved.length > 0 && (
          <View style={[styles.banner, { backgroundColor: TONES.success.bg }]}>
            <Text style={styles.bannerTitle}>Ya recibes pedidos de:</Text>
            <Text style={styles.body}>{approved.map((t) => tradeName(t.tradeId)).join(', ')}</Text>
          </View>
        )}

        <View style={[styles.card, styles.identity]}>
          <View
            style={[
              styles.dot,
              { backgroundColor: data.identityVerified ? colors.primary : colors.amber },
            ]}
          />
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>
              {data.identityVerified ? 'Identidad verificada' : 'Identidad en revisión'}
            </Text>
            <Text style={styles.secondary}>
              {data.identityVerified
                ? 'DNI, selfie y antecedentes revisados'
                : identityPending.length > 0
                  ? `Falta: ${describeMissing([...new Set(identityPending)]).join(', ')}`
                  : 'La revisamos junto con tu primer oficio'}
            </Text>
          </View>
        </View>

        {data.proTrades.length === 0 && (
          <Text style={styles.secondary}>Aún no agregas oficios.</Text>
        )}

        {data.proTrades.map((trade) => {
          const view = proTradeView({
            status: trade.status,
            tradeName: data.trades.find((t) => t.id === trade.tradeId)?.name ?? '',
            ratingsForFull: data.settings.ratingsForFull,
            reason: trade.reason,
          });
          const tone = TONES[view.tone];
          const editable = isEditable(trade.status);
          return (
            <View key={trade.id} style={[styles.card, styles.trade]} testID={`oficio-${trade.id}`}>
              <View style={styles.tradeHeader}>
                <Text style={styles.cardTitle}>{tradeName(trade.tradeId)}</Text>
                <Text style={[styles.badge, { backgroundColor: tone.bg, color: tone.fg }]}>
                  {view.label}
                </Text>
              </View>
              <Text style={styles.body}>{view.description}</Text>
              {trade.status === 'approved_observation' && (
                <Text style={styles.progress}>
                  Calificaciones buenas:{' '}
                  {observationProgress(trade.goodRatings, data.settings.ratingsForFull)}
                </Text>
              )}
              {editable && trade.missing.length > 0 && (
                <Text style={styles.secondary}>
                  Falta:{' '}
                  {describeMissing(trade.missing, (item) => minOf(trade.tradeId, item)).join(', ')}
                </Text>
              )}
              {editable && (
                <Button
                  label={trade.missing.length > 0 ? 'Completar lo que falta' : 'Revisar y enviar'}
                  onPress={() => router.push('/registro')}
                />
              )}
            </View>
          );
        })}

        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/registro')}
          style={styles.addButton}
        >
          <Text style={styles.addText}>+ Agregar otro oficio</Text>
        </Pressable>
        <View style={styles.note}>
          <Text style={styles.noteText}>
            Te llegan pedidos de los oficios aprobados mientras estés en línea y dentro de tu zona.
          </Text>
        </View>
        <Link href="/solicitudes" style={styles.link}>
          Ir a solicitudes cercanas
        </Link>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  steps: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: 12,
    gap: 6,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 8,
    borderRadius: radii.md,
  },
  stepNext: { backgroundColor: colors.primarySoft },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepMark: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.text },
  stepMarkDone: { color: colors.onPrimary },
  safe: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, gap: 12 },
  flex: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  link: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.primary },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 16,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  cardTitle: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.text },
  secondary: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
  trade: { gap: 8 },
  tradeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  badge: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progress: { fontFamily: fonts.display, fontSize: 14, color: colors.primary },
  banner: { borderRadius: radii.md, padding: 14, gap: 4 },
  bannerTitle: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.text },
  addButton: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.primary },
  note: { backgroundColor: colors.primarySoft, borderRadius: radii.md, padding: 12 },
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
