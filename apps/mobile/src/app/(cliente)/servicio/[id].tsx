import { formatSoles, maskPhone } from '@cerquita/shared';
import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { colors, fonts, radii } from '@/theme';

/** Pantalla 5 provisional: el seguimiento en vivo, el código de seguridad y el SOS llegan en la fase 6. */
export default function Servicio() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [info, setInfo] = useState<{
    price: number | null;
    address: string | null;
    phone: string | null;
  } | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('jobs').select('final_price_cents').eq('id', id).maybeSingle(),
      supabase.rpc('job_exact_address', { p_job: id }),
      supabase.rpc('job_counterpart_phone', { p_job: id }),
    ]).then(([job, address, phone]) =>
      setInfo({
        price: job.data?.final_price_cents ?? null,
        address: address.data,
        phone: phone.data,
      }),
    );
  }, [id]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.card}>
        <Text style={styles.kicker}>Pantalla 5 · fase 6</Text>
        <Text style={styles.title}>Oferta aceptada</Text>
        {info?.price ? (
          <Text style={styles.body}>Precio acordado: {formatSoles(info.price)}</Text>
        ) : null}
        {info?.address ? <Text style={styles.body}>Dirección: {info.address}</Text> : null}
        {info?.phone ? (
          <Text style={styles.body}>Teléfono del profesional: {maskPhone(info.phone)}</Text>
        ) : null}
        <Text style={styles.secondary}>
          El seguimiento en vivo, el código de seguridad y el botón SOS llegan en la fase 6.
        </Text>
        <Link href="/inicio" style={styles.link}>
          Volver al inicio
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, padding: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 8,
  },
  kicker: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textSecondary },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 15, color: colors.text },
  secondary: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  link: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.primary, paddingTop: 8 },
});
