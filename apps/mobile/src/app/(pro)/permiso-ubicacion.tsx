import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { colors, fonts, radii } from '@/theme';

/** Pantalla 13: explicación propia antes del permiso del sistema. “Ahora no” no insiste. */
export default function PermisoUbicacion() {
  const { job } = useLocalSearchParams<{ job?: string }>();
  const back = () =>
    job
      ? router.replace({ pathname: '/trabajo/[id]', params: { id: job, permiso: 'ok' } })
      : router.back();
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          Cerquita usa tu ubicación
        </Text>
        <Text style={styles.body}>
          Incluso con la app cerrada o en segundo plano, solo mientras tengas un servicio aceptado,
          para:
        </Text>
        {[
          'Mostrar a clientes cercanos tu disponibilidad',
          'Que tu cliente te vea llegar',
          'Activar el botón de emergencia (SOS)',
        ].map((item) => (
          <View key={item} style={styles.item}>
            <View style={styles.dot} />
            <Text style={styles.body}>{item}</Text>
          </View>
        ))}
        <View style={styles.note}>
          <Text style={styles.noteText}>
            Solo se comparte durante un servicio y se detiene sola al terminar o cancelar. Puedes
            desactivarla en Ajustes.
          </Text>
        </View>
      </View>
      <View style={styles.footer}>
        <Button label="Continuar" onPress={back} />
        <Button variant="ghost" label="Ahora no" onPress={() => router.back()} />
        <Text style={styles.secondary}>
          Después de “Continuar” verás el permiso de tu teléfono.
        </Text>
      </View>
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
  content: { gap: 14, marginTop: 24 },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.text, flex: 1 },
  item: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  note: { backgroundColor: '#E7F0EC', borderRadius: radii.md, padding: 14 },
  noteText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
  footer: { gap: 8 },
  secondary: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
