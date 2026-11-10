import {
  formatRating,
  formatSoles,
  isTrackingStatus,
  jobTitle,
  parseSolesToCents,
  sanitizeSecurityCode,
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
import { InitialsAvatar } from '@/components/initials-avatar';
import { Stars } from '@/components/stars';
import { confirm } from '@/lib/confirm';
import { supabase } from '@/lib/supabase';
import { ContactActions, StepBar } from '@/service/contact-actions';
import { hasLocationPermission, startTracking, stopTracking } from '@/service/tracking';
import { useService } from '@/service/use-service';
import { colors, fonts, radii } from '@/theme';

const STEPS = ['Aceptado', 'En camino', 'En el domicilio', 'Terminado', 'Confirmado'];

/** Pantalla 10: “Ir al domicilio” → “Llegué” (con código) → “Terminado” (monto). */
export default function Trabajo() {
  const { id, permiso } = useLocalSearchParams<{ id: string; permiso?: string }>();
  const { job, other, address, reload } = useService(id);
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [stars, setStars] = useState(0);
  const [rated, setRated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reanuda el envío si la app se reabre con el servicio en curso; lo corta al terminar.
  useEffect(() => {
    if (!job) return;
    if (isTrackingStatus(job.status)) startTracking(job.id, job.status);
    else stopTracking();
  }, [job?.id, job?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await fn();
    setBusy(false);
    if (rpcError) setError(rpcError.message);
    await reload();
    return !rpcError;
  }

  async function goToHome() {
    if (!(await hasLocationPermission()) && permiso !== 'ok') {
      router.push({ pathname: '/permiso-ubicacion', params: { job: id } });
      return;
    }
    if (await run(() => supabase.rpc('start_trip', { p_job: id }))) {
      const ok = await startTracking(id, 'on_the_way');
      if (!ok)
        setError(
          'Sin permiso de ubicación tu cliente no te verá llegar. Actívalo en los ajustes del teléfono.',
        );
    }
  }

  async function arrived() {
    if (code.length !== 4) return setError('Pídele al cliente su código de 4 dígitos.');
    if (await run(() => supabase.rpc('arrive', { p_job: id, p_code: code })))
      await startTracking(id, 'at_home');
  }

  async function finish() {
    const cents = amount.trim() === '' ? null : parseSolesToCents(amount);
    if (amount.trim() !== '' && cents === null) return setError('Escribe un monto válido.');
    const agreed = job?.final_price_cents ?? 0;
    const final = cents ?? agreed;
    const ok = await confirm(
      'Marcar como terminado',
      final === agreed
        ? `El cliente confirmará ${formatSoles(final)}.`
        : `El monto cambió de ${formatSoles(agreed)} a ${formatSoles(final)}. El cliente debe aprobarlo.`,
      'Terminar',
    );
    if (!ok) return;
    if (await run(() => supabase.rpc('finish_job', { p_job: id, p_final_cents: final })))
      await stopTracking();
  }

  async function cancel() {
    if (await run(() => supabase.rpc('cancel_service', { p_job: id, p_reason: reason }))) {
      await stopTracking();
      setCancelling(false);
    }
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

  const step = serviceStepIndex(job.status === 'rated' ? 'confirmed' : job.status);
  const headline: Record<string, string> = {
    accepted: 'Ve hacia el domicilio',
    on_the_way: 'En camino · GPS activo, el cliente te ve',
    at_home: 'En el domicilio',
    finished: 'Esperando que el cliente confirme el monto',
    confirmed: 'Trabajo confirmado',
    rated: 'Trabajo confirmado',
    cancelled: 'Servicio cancelado',
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="link" onPress={() => router.replace('/solicitudes')}>
          <Text style={styles.back}>‹ Solicitudes</Text>
        </Pressable>
        {step >= 0 && <StepBar steps={STEPS} current={step} />}
        <Text style={styles.title} accessibilityRole="header">
          {headline[job.status] ?? SERVICE_LABELS[job.status]}
        </Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <InitialsAvatar name={other?.name ?? null} />
            <View style={styles.flex}>
              <Text style={styles.name}>{other?.name ?? 'Cliente'}</Text>
              <Text style={styles.secondary}>Cliente {formatRating(other?.rating ?? null)}</Text>
            </View>
            <View style={styles.priceCol}>
              <Text style={styles.price}>{formatSoles(job.final_price_cents ?? 0)}</Text>
              <Text style={styles.secondary}>precio acordado</Text>
            </View>
          </View>
          {address && <Text style={styles.address}>{address}</Text>}
          <Text style={styles.body}>{jobTitle(job.description)}</Text>
          {job.status !== 'cancelled' && job.status !== 'confirmed' && job.status !== 'rated' && (
            <ContactActions jobId={job.id} phone={other?.phone ?? null} />
          )}
        </View>

        {job.status === 'on_the_way' && (
          <View style={styles.field}>
            <Text style={styles.label} nativeID="code-label">
              Código de seguridad del cliente
            </Text>
            <TextInput
              accessibilityLabelledBy="code-label"
              style={[styles.input, styles.code]}
              value={code}
              onChangeText={(t) => setCode(sanitizeSecurityCode(t))}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="••••"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
        )}
        {job.status === 'at_home' && (
          <View style={styles.field}>
            <Text style={styles.label} nativeID="final-label">
              Monto final (déjalo vacío si es el acordado)
            </Text>
            <TextInput
              accessibilityLabelledBy="final-label"
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder={String((job.final_price_cents ?? 0) / 100)}
              placeholderTextColor={colors.textSecondary}
            />
          </View>
        )}
        {job.status === 'cancelled' && job.cancel_reason && (
          <Text style={styles.secondary}>Motivo: {job.cancel_reason}</Text>
        )}

        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}

        {(job.status === 'confirmed' || job.status === 'rated') && !rated && (
          <View style={styles.field}>
            <Text style={styles.label}>Califica al cliente</Text>
            <Stars value={stars} onChange={setStars} />
            <Button
              variant="outline"
              label="Enviar calificación"
              disabled={stars === 0}
              onPress={async () => {
                const { error: e } = await supabase
                  .from('ratings')
                  .insert({ job_id: id, to_id: job.client_id, stars });
                if (e && e.code !== '23505') setError('No pudimos guardar tu calificación.');
                else setRated(true);
              }}
            />
          </View>
        )}
        {job.status === 'accepted' && (
          <Button label="Ir al domicilio" loading={busy} onPress={goToHome} />
        )}
        {job.status === 'on_the_way' && (
          <Button label="Llegué al domicilio" loading={busy} onPress={arrived} />
        )}
        {job.status === 'at_home' && <Button label="Terminado" loading={busy} onPress={finish} />}

        {['accepted', 'on_the_way', 'at_home'].includes(job.status) &&
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
              <Button
                variant="outline"
                label="Confirmar cancelación"
                loading={busy}
                onPress={cancel}
              />
            </View>
          ) : (
            <Button variant="ghost" label="Cancelar servicio" onPress={() => setCancelling(true)} />
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
  address: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text },
  secondary: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
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
  code: { fontFamily: fonts.display, fontSize: 26, letterSpacing: 10, textAlign: 'center' },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.md,
    padding: 12,
  },
});
