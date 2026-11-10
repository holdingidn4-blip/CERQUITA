import {
  describeMissing,
  IDENTITY_KINDS,
  observationProgress,
  proTradeView,
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
import { useVerification, type ProTrade } from '@/pro/use-verification';
import { colors, fonts, radii } from '@/theme';

const TONES: Record<Tone, { bg: string; fg: string }> = {
  success: { bg: '#DCEFE8', fg: colors.primary },
  info: { bg: '#E3ECF5', fg: '#1F4E79' },
  warning: { bg: colors.amberSoft, fg: '#7A5A12' },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  neutral: { bg: '#ECE8DD', fg: '#2F3B36' },
};

export default function Oficios() {
  const { data, error, setError, uploading, upload, submit, load } = useVerification();
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

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

  const identityMissing = IDENTITY_KINDS.filter(
    (k) => !data.documents.some((d) => d.kind === k && d.proTradeId === null),
  );
  const evidence = (id: string) => data.documents.filter((d) => d.proTradeId === id).length;

  async function resend(trade: ProTrade) {
    setSending(trade.id);
    const failure = await submit(trade.id);
    setSending(null);
    setError(failure);
  }

  return (
    <SafeAreaView style={styles.safe}>
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
            Mis oficios
          </Text>
          <Link href="/ajustes" style={styles.link}>
            Cuenta
          </Link>
        </View>

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
                : identityMissing.length > 0
                  ? `Falta: ${describeMissing(identityMissing, data.minEvidence).join(', ')}`
                  : 'La revisamos junto con tu primer oficio'}
            </Text>
          </View>
        </View>

        <Text style={styles.secondary}>Cada oficio se verifica por separado</Text>

        {data.proTrades.length === 0 && (
          <Text style={styles.secondary}>Aún no agregas oficios.</Text>
        )}

        {data.proTrades.map((trade) => {
          const name = data.trades.find((t) => t.id === trade.tradeId)?.pro_name ?? '';
          const view = proTradeView({
            status: trade.status,
            tradeName: data.trades.find((t) => t.id === trade.tradeId)?.name ?? name,
            ratingsForFull: data.ratingsForFull,
            reason: trade.reason,
          });
          const tone = TONES[view.tone];
          const count = evidence(trade.id);
          return (
            <View key={trade.id} style={[styles.card, styles.trade]} testID={`oficio-${trade.id}`}>
              <View style={styles.tradeHeader}>
                <Text style={styles.cardTitle}>{name}</Text>
                <Text style={[styles.badge, { backgroundColor: tone.bg, color: tone.fg }]}>
                  {view.label}
                </Text>
              </View>
              <Text style={styles.body}>{view.description}</Text>
              {trade.status === 'approved_observation' && (
                <Text style={styles.progress}>
                  {observationProgress(trade.goodRatings, data.ratingsForFull)}
                </Text>
              )}
              {view.canAddEvidence && (
                <View style={styles.actions}>
                  <Text style={styles.secondary}>
                    Evidencia: {count} de {data.minEvidence}
                  </Text>
                  <Button
                    variant="outline"
                    label="Subir más evidencia"
                    loading={uploading === trade.id}
                    onPress={() => upload('work_photo', trade.id)}
                  />
                  <Button
                    label="Enviar a revisión"
                    loading={sending === trade.id}
                    onPress={() => resend(trade)}
                  />
                </View>
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
            Solo ves pedidos de oficios aprobados, mientras estés en línea y dentro de tu radio.
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
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: '#2F3B36' },
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
  actions: { gap: 8, marginTop: 4 },
  addButton: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D5D0C3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.primary },
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
