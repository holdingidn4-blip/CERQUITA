import { router } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii } from '@/theme';

/** Llamar (abre el marcador, nunca llama solo) y Mensaje (chat del servicio). */
export function ContactActions({
  jobId,
  phone,
  extra,
}: {
  jobId: string;
  phone: string | null;
  extra?: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <Action
        label="Llamar"
        disabled={!phone}
        onPress={() => phone && Linking.openURL(`tel:+${phone.replace(/^\+/, '')}`)}
      />
      <Action
        label="Mensaje"
        onPress={() => router.push({ pathname: '/chat/[id]', params: { id: jobId } })}
      />
      {extra}
    </View>
  );
}

export function Action({
  label,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, danger && styles.danger, disabled && styles.disabled]}
    >
      <Text style={[styles.label, danger && styles.dangerLabel]}>{label}</Text>
    </Pressable>
  );
}

export function StepBar({ steps, current }: { steps: string[]; current: number }) {
  return (
    <View
      style={styles.steps}
      accessibilityLabel={`Paso ${current + 1} de ${steps.length}: ${steps[current] ?? ''}`}
    >
      {steps.map((s, i) => (
        <View key={s} style={[styles.step, i <= current && styles.stepOn]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  action: {
    flex: 1,
    height: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.text },
  danger: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  dangerLabel: { color: colors.danger },
  disabled: { opacity: 0.5 },
  steps: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#ECE8DD' },
  stepOn: { backgroundColor: colors.primary },
});
