import {
  arrivalState,
  distanceAndEta,
  etaMinutes,
  formatArrival,
  formatRating,
  formatSoles,
  SERVICE_LABELS,
  serviceStepIndex,
} from '@cerquita/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { confirm } from '@/lib/confirm';
import { useSettingInt } from '@/lib/settings';
import { InitialsAvatar } from '@/components/initials-avatar';
import { MapPreview } from '@/components/map-preview';
import { OffAppWarning } from '@/components/off-app-warning';
import { BreakdownCard } from '@/service/breakdown-card';
import { ReevaluationAlert } from '@/service/reevaluation-alert';
import { supabase } from '@/lib/supabase';
import { SosButton } from '@/components/sos-button';
import { ContactActions, StepBar } from '@/service/contact-actions';
import { useService } from '@/service/use-service';
import { PortfolioToggle, ReceiptButton } from '@/service/after-service';
import { colors, fonts, radii } from '@/theme';

const STEPS = ['Aceptado', 'En camino', 'En el domicilio', 'Terminado', 'Confirmado'];

/** Pantalla 5: posición en vivo del profesional, código de seguridad, llamar y mensaje. */
export default function Seguimiento() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, other, code, live, reload } = useService(id, { live: true });
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [visitFee, setVisitFee] = useState<number | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimSent, setClaimSent] = useState(false);
  const [claimText, setClaimText] = useState('');
  const [switching, setSwitching] = useState(false);
  const grace = useSettingInt('no_show_grace_minutes') ?? 15;

  useEffect(() => {
    if (!job?.trade_id) return;
    supabase
      .rpc('visit_fee_for_trade', { p_trade: job.trade_id })
      .then(({ data }) => setVisitFee(data ?? null));
  }, [job?.trade_id]);

  useEffect(() => {
    if (job?.status === 'finished')
      router.replace({ pathname: '/servicio/[id]/confirmar', params: { id } });
  }, [job?.status, id]);

  async function cancel() {
    const { error: cancelError } = await supabase.rpc('cancel_service', {
      p_job: id,
      p_reason: reason,
    });
    if (cancelError) return setError(cancelError.message);
    setCancelling(false);
    await reload();
  }

  async function switchPro() {
    const ok = await confirm(
      '¿Cambiar de profesional?',
      'Verás las otras ofertas de tu pedido. No pagas nada por este cambio.',
      'Cambiar',
    );
    if (!ok) return;
    setSwitching(true);
    const { error: switchError } = await supabase.rpc('report_no_show', { p_job: id });
    setSwitching(false);
    if (switchError) return setError(switchError.message);
    router.replace({ pathname: '/pedido/[id]/ofertas', params: { id } });
  }

  if (job === undefined) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }
  if (job === null) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <Text style={styles.body}>Este servicio no está disponible.</Text>
      </SafeAreaView>
    );
  }

  const first = other?.name.split(' ')[0] ?? 'El profesional';
  const eta = etaMinutes(live?.distance_m);
  const headline: Record<string, string> = {
    accepted: `${first} aceptó tu pedido`,
    on_the_way: `${first} viene en camino`,
    at_home: `${first} llegó a tu domicilio`,
    price_renegotiated: `${first} está trabajando con el precio reevaluado`,
    confirmed: 'Servicio confirmado',
    rated: 'Servicio confirmado',
    cancelled: 'Servicio cancelado',
  };
  const arrival =
    job.status === 'accepted' || job.status === 'on_the_way'
      ? arrivalState(job.promised_arrival_at, grace)
      : ({ kind: 'none' } as const);
  const step = serviceStepIndex(job.status);
  const atHome = job.status === 'at_home' || job.status === 'price_renegotiated';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="link" onPress={() => router.replace('/inicio')}>
          <Text style={styles.back}>‹ Inicio</Text>
        </Pressable>
        {step >= 0 && <StepBar steps={STEPS} current={step} />}
        <Text style={styles.title} accessibilityRole="header">
          {headline[job.status] ?? SERVICE_LABELS[job.status]}
        </Text>
        {job.status === 'on_the_way' && (
          <Text style={styles.secondary}>
            {live
              ? `Llega en ${eta} min · a ${distanceAndEta(live.distance_m).split(' · ')[0]} de ti`
              : 'Esperando su ubicación…'}
          </Text>
        )}

        {arrival.kind !== 'none' && job.promised_arrival_at && (
          <View
            style={[styles.card, arrival.kind === 'can_switch' && styles.lateCard]}
            testID="llegada"
          >
            <Text style={styles.label}>
              Llegada acordada: {formatArrival(job.promised_arrival_at)}
            </Text>
            {arrival.kind === 'on_time' && (
              <Text style={styles.secondary}>Faltan {arrival.minutesLeft} min.</Text>
            )}
            {arrival.kind === 'late' && (
              <Text style={styles.secondary}>
                {first} lleva {arrival.minutesLate} min de retraso. Si no llega en{' '}
                {grace - arrival.minutesLate} min, podrás elegir a otro profesional.
              </Text>
            )}
            {arrival.kind === 'can_switch' && (
              <>
                <Text style={styles.body}>
                  {first} no llegó a la hora acordada. ¿Buscamos otro profesional?
                </Text>
                <Button label="Cambiar de profesional" loading={switching} onPress={switchPro} />
              </>
            )}
          </View>
        )}

        {live && (job.status === 'on_the_way' || job.status === 'at_home') && (
          <MapPreview
            center={{ latitude: live.latitude, longitude: live.longitude }}
            height={200}
            label={`Ubicación de ${first}`}
          />
        )}

        <View style={styles.card}>
          <View style={styles.row}>
            <InitialsAvatar name={other?.name ?? null} />
            <View style={styles.flex}>
              <Text style={styles.name}>{other?.name ?? 'Profesional'}</Text>
              <Text style={styles.secondary}>
                {formatRating(other?.rating ?? null)} · {job.trade?.pro_name}
              </Text>
            </View>
            <View style={styles.priceCol}>
              <Text style={styles.price}>{formatSoles(job.final_price_cents ?? 0)}</Text>
              <Text style={styles.secondary}>precio acordado</Text>
            </View>
          </View>
          {code && (
            <View
              style={styles.codeBox}
              accessibilityLabel={`Código de seguridad ${code.split('').join(' ')}`}
            >
              <View style={styles.flex}>
                <Text style={styles.label}>Código de seguridad</Text>
                <Text style={styles.secondary}>Díselo al llegar</Text>
              </View>
              <View style={styles.digits}>
                {code.split('').map((d, i) => (
                  <Text key={i} style={styles.digit}>
                    {d}
                  </Text>
                ))}
              </View>
            </View>
          )}
          {['accepted', 'on_the_way', 'at_home', 'price_renegotiated'].includes(job.status) && (
            <ContactActions
              jobId={job.id}
              phone={other?.phone ?? null}
              extra={<SosButton jobId={job.id} />}
            />
          )}
        </View>

        {atHome && job.reeval_proposed_at && (
          <ReevaluationAlert job={job} proName={first} onAnswered={reload} />
        )}
        {job.status === 'price_renegotiated' && (
          <BreakdownCard
            title="Precio aprobado"
            laborCents={job.labor_cents ?? 0}
            materialsCents={job.materials_cents}
            provider={job.materials_provided_by}
            items={job.materials_items}
            currency={job.currency_code}
          />
        )}
        {job.status === 'cancelled' && (job.visit_fee_cents ?? 0) > 0 && (
          <Text style={styles.feeDue} accessibilityRole="alert">
            Cancelaste después de la llegada: págale a {first} la tarifa de visita/diagnóstico de{' '}
            {formatSoles(job.visit_fee_cents ?? 0)} en efectivo, Yape o Plin.
          </Text>
        )}
        {['confirmed', 'rated'].includes(job.status) &&
          (claimSent ? (
            <Text style={styles.secondary}>
              Recibimos tu reclamo. Soporte revisará el caso con los datos verificados del
              profesional.
            </Text>
          ) : claiming ? (
            <View style={styles.field}>
              <TextInput
                accessibilityLabel="Describe el problema"
                style={styles.input}
                value={claimText}
                onChangeText={setClaimText}
                placeholder="¿Qué pasó con el trabajo?"
                placeholderTextColor={colors.textSecondary}
                multiline
                maxLength={2000}
              />
              <Button
                variant="outline"
                label="Enviar reclamo"
                onPress={async () => {
                  const { error: e } = await supabase.rpc('file_claim', {
                    p_job: id,
                    p_description: claimText,
                  });
                  if (e)
                    setError(
                      e.code === '23505' ? 'Ya enviaste un reclamo por este servicio.' : e.message,
                    );
                  else setClaimSent(true);
                }}
              />
            </View>
          ) : (
            <Button
              variant="ghost"
              label="Reportar un problema"
              onPress={() => setClaiming(true)}
            />
          ))}
        {['confirmed', 'rated'].includes(job.status) && <ReceiptButton jobId={job.id} />}
        {['confirmed', 'rated'].includes(job.status) && <PortfolioToggle jobId={job.id} />}
        {job.status === 'confirmed' && (
          <Button
            label="Calificar el servicio"
            onPress={() => router.push({ pathname: '/servicio/[id]/calificar', params: { id } })}
          />
        )}
        {job.status === 'cancelled' && job.cancel_reason && (
          <Text style={styles.secondary}>Motivo: {job.cancel_reason}</Text>
        )}
        <Text style={styles.secondary}>Pagas al terminar: efectivo, Yape o Plin.</Text>
        {job.status !== 'cancelled' && <OffAppWarning />}

        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        {['accepted', 'on_the_way', 'at_home', 'price_renegotiated'].includes(job.status) &&
          (cancelling ? (
            <View style={styles.field}>
              <TextInput
                accessibilityLabel="Motivo de la cancelación"
                style={styles.input}
                value={reason}
                onChangeText={setReason}
                placeholder="¿Por qué cancelas?"
                placeholderTextColor={colors.textSecondary}
                maxLength={300}
              />
              {atHome && visitFee !== null && (
                <Text style={styles.feeDue}>
                  {first} ya llegó: si cancelas, le debes la tarifa de visita/diagnóstico de{' '}
                  {formatSoles(visitFee)}.
                </Text>
              )}
              <Button
                variant="outline"
                label={
                  atHome && visitFee !== null
                    ? `Cancelar y pagar visita (${formatSoles(visitFee)})`
                    : 'Confirmar cancelación'
                }
                onPress={cancel}
              />
            </View>
          ) : (
            <Button
              variant="ghost"
              label={atHome ? 'Cancelar (pagas la visita)' : 'Cancelar pedido'}
              onPress={() => setCancelling(true)}
            />
          ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  content: { padding: 20, gap: 14 },
  flex: { flex: 1 },
  back: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.primary },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.text },
  priceCol: { alignItems: 'flex-end' },
  price: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 15, color: colors.text },
  secondary: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  label: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.text },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#E7F0EC',
    borderRadius: radii.md,
    padding: 12,
  },
  digits: { flexDirection: 'row', gap: 6 },
  digit: {
    width: 36,
    height: 44,
    lineHeight: 44,
    textAlign: 'center',
    borderRadius: 10,
    backgroundColor: colors.surface,
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.text,
    overflow: 'hidden',
  },
  field: { gap: 6 },
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
  lateCard: { backgroundColor: colors.amberSoft, borderColor: colors.amber },
  feeDue: {
    fontFamily: fonts.bodySemibold,
    fontSize: 14,
    lineHeight: 20,
    color: '#5C4410',
    backgroundColor: colors.amberSoft,
    borderRadius: radii.md,
    padding: 12,
  },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.md,
    padding: 12,
  },
});
