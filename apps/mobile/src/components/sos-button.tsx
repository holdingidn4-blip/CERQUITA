import { SOS_HOLD_MS } from '@cerquita/shared';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts, radii } from '@/theme';

/** Toque largo de 2 s para evitar activaciones por error. Abre la cuenta regresiva (pantalla 17). */
export function SosButton({ jobId }: { jobId?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="SOS: mantén presionado 2 segundos"
      delayLongPress={SOS_HOLD_MS}
      onLongPress={() => router.push({ pathname: '/sos', params: jobId ? { job: jobId } : {} })}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.label}>SOS</Text>
      <Text style={styles.hint}>Emergencia</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: '#F6CFCA' },
  label: { fontFamily: fonts.display, fontSize: 15, color: colors.danger },
  hint: { fontFamily: fonts.body, fontSize: 11, color: colors.danger },
});
