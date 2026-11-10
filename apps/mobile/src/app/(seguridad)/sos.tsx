import {
  EMERGENCY_NUMBERS,
  SOS_COUNTDOWN_S,
  SOS_SHARE_EVERY_MS,
  smsLink,
  sosMessage,
  whatsappLink,
} from '@cerquita/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/button';
import { getCurrentPoint, type Point } from '@/lib/location';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radii } from '@/theme';

type Contact = { name: string; phone: string };

/**
 * Pantalla 17: cuenta regresiva de 5 s con “Cancelar”. Al terminar abre la alerta para soporte,
 * comparte la ubicación cada 10 s y prepara el mensaje a los contactos. La app nunca llama sola.
 */
export default function Sos() {
  const { job } = useLocalSearchParams<{ job?: string }>();
  const { account } = useAuth();
  const [left, setLeft] = useState(SOS_COUNTDOWN_S);
  const [alertId, setAlertId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [point, setPoint] = useState<Point | null>(null);
  const [error, setError] = useState<string | null>(null);
  const opened = useRef(false);

  useEffect(() => {
    supabase
      .from('trusted_contacts')
      .select('name, phone')
      .then(({ data }) => setContacts(data ?? []));
    getCurrentPoint().then(setPoint);
  }, []);

  // Cuenta regresiva.
  useEffect(() => {
    if (alertId || left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left, alertId]);

  // Al llegar a 0 se abre la alerta (una sola vez).
  useEffect(() => {
    if (left > 0 || opened.current) return;
    opened.current = true;
    supabase
      .rpc('sos_open', { p_job: job ?? undefined, p_lat: point?.latitude, p_lng: point?.longitude })
      .then(({ data, error: e }) => {
        if (e || !data) setError('No pudimos avisar a soporte. Llama al 105.');
        else setAlertId(data.id);
      });
  }, [left, job, point]);

  // Comparte ubicación cada 10 s hasta que soporte cierre la alerta.
  useEffect(() => {
    if (!alertId) return;
    const id = setInterval(async () => {
      const p = await getCurrentPoint();
      if (!p) return;
      setPoint(p);
      const { error: e } = await supabase.rpc('sos_update_location', {
        p_alert: alertId,
        p_lat: p.latitude,
        p_lng: p.longitude,
      });
      if (e) clearInterval(id); // soporte la cerró
    }, SOS_SHARE_EVERY_MS);
    return () => clearInterval(id);
  }, [alertId]);

  const message = sosMessage(account?.fullName ?? null, point);
  const phones = contacts.map((c) => c.phone);

  if (!alertId && left > 0) {
    return (
      <SafeAreaView style={[styles.safe, styles.countdown]}>
        <Text style={styles.kicker}>SOS</Text>
        <Text style={styles.number} accessibilityLiveRegion="assertive">
          {left}
        </Text>
        <Text style={styles.body}>Avisaremos a soporte y a tus contactos de confianza.</Text>
        <Button variant="outline" label="Cancelar" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          SOS activado
        </Text>
        <Text style={styles.body}>
          {alertId
            ? 'Soporte ya recibió tu alerta y ve tu ubicación cada 10 segundos.'
            : (error ?? 'Avisando a soporte…')}
        </Text>
        <View style={styles.card}>
          <Text style={styles.label}>Llama a emergencias</Text>
          <View style={styles.row}>
            {EMERGENCY_NUMBERS.map((n) => (
              <Pressable
                key={n.number}
                accessibilityRole="button"
                onPress={() => Linking.openURL(`tel:${n.number}`)}
                style={styles.call}
              >
                <Text style={styles.callNumber}>{n.number}</Text>
                <Text style={styles.callLabel}>{n.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Avisa a tus contactos de confianza</Text>
          {contacts.length === 0 ? (
            <Text style={styles.secondary}>
              No tienes contactos guardados. Agrégalos en Cuenta y privacidad.
            </Text>
          ) : (
            <>
              <Text style={styles.secondary}>{contacts.map((c) => c.name).join(', ')}</Text>
              <Button
                label="Enviar SMS con mi ubicación"
                onPress={() =>
                  Linking.openURL(
                    smsLink(phones, message, Platform.OS === 'ios' ? 'ios' : 'android'),
                  )
                }
              />
              <Button
                variant="outline"
                label="Enviar por WhatsApp"
                onPress={() => Linking.openURL(whatsappLink(phones[0] ?? '', message))}
              />
            </>
          )}
        </View>
      </View>
      <Button variant="ghost" label="Volver" onPress={() => router.back()} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 20,
    justifyContent: 'space-between',
  },
  countdown: {
    backgroundColor: colors.dangerSoft,
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 20,
  },
  kicker: { fontFamily: fonts.display, fontSize: 22, color: colors.danger, textAlign: 'center' },
  number: { fontFamily: fonts.display, fontSize: 120, color: colors.danger, textAlign: 'center' },
  content: { gap: 14 },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.danger },
  body: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 22,
    color: colors.text,
    textAlign: 'center',
  },
  secondary: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
  },
  label: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.text },
  row: { flexDirection: 'row', gap: 8 },
  call: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.danger,
  },
  callNumber: { fontFamily: fonts.display, fontSize: 22, color: colors.danger },
  callLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.danger },
});
