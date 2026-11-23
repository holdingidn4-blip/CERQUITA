import { ONBOARDING_STEPS, PHOTO_TIPS } from '@cerquita/shared';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { Button } from '@/components/button';
import { colors, fonts, radii } from '@/theme';

/** Marco de cada paso: progreso, objetivo, ayuda y botones grandes. */
export function StepShell({
  index,
  children,
  error,
  primaryLabel,
  primaryDisabled,
  primaryLoading,
  onPrimary,
  onBack,
}: {
  index: number;
  children: ReactNode;
  error: string | null;
  primaryLabel: string;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  onPrimary: () => void;
  onBack?: () => void;
}) {
  const step = ONBOARDING_STEPS[index];
  const [help, setHelp] = useState(false);
  if (!step) return null;
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.stepLabel}>
            Paso {index + 1} de {ONBOARDING_STEPS.length} · {step.title}
          </Text>
          <View
            style={styles.progress}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 1, max: ONBOARDING_STEPS.length, now: index + 1 }}
          >
            {ONBOARDING_STEPS.map((s, i) => (
              <View key={s.key} style={[styles.segment, i <= index && styles.segmentOn]} />
            ))}
          </View>
          <Text style={styles.goal} accessibilityRole="header">
            {step.goal}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: help }}
            onPress={() => setHelp((h) => !h)}
            style={styles.helpToggle}
          >
            <Text style={styles.helpToggleText}>{help ? '▾' : '▸'} ¿Por qué te pedimos esto?</Text>
          </Pressable>
          {help && <Text style={styles.helpText}>{step.why}</Text>}
        </View>

        {children}

        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        <Text style={styles.autosave}>Se guarda solo. Puedes salir y seguir después.</Text>
        <Button
          label={primaryLabel}
          disabled={primaryDisabled}
          loading={primaryLoading}
          onPress={onPrimary}
          style={styles.bigButton}
        />
        {onBack && <Button label="Atrás" variant="ghost" onPress={onBack} />}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Una cosa por subir: título, estado en palabras y botón grande. */
export function UploadRow({
  title,
  subtitle,
  done,
  busy,
  actionLabel = 'Tomar foto',
  doneLabel = 'Listo',
  disabled,
  onPress,
  children,
}: {
  title: string;
  subtitle?: string;
  done: boolean;
  busy: boolean;
  actionLabel?: string;
  doneLabel?: string;
  disabled?: boolean;
  onPress?: () => void;
  children?: ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <View style={styles.flex}>
          <Text style={styles.rowTitle}>{title}</Text>
          {subtitle && <Text style={styles.secondary}>{subtitle}</Text>}
        </View>
        <Text style={[styles.status, done ? styles.statusDone : styles.statusPending]}>
          {done ? `✓ ${doneLabel}` : 'Falta'}
        </Text>
      </View>
      {children}
      {onPress &&
        !disabled &&
        (busy ? (
          <ActivityIndicator color={colors.primary} style={styles.busy} />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${actionLabel}: ${title}`}
            onPress={onPress}
            style={styles.action}
          >
            <Text style={styles.actionText}>{actionLabel}</Text>
          </Pressable>
        ))}
    </View>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <View style={styles.note}>
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

function GoodPhoto() {
  return (
    <Svg width={120} height={84} viewBox="0 0 120 84" accessibilityElementsHidden>
      <Rect x={0} y={0} width={120} height={84} rx={10} fill="#EAF4F0" />
      <Circle cx={100} cy={16} r={8} fill="#F2B33D" />
      <Rect
        x={30}
        y={20}
        width={60}
        height={52}
        rx={3}
        fill="#C9A27A"
        stroke="#7A5530"
        strokeWidth={2}
      />
      <Path d="M60 20v52" stroke="#7A5530" strokeWidth={2} />
      <Circle cx={55} cy={46} r={2} fill="#7A5530" />
      <Circle cx={65} cy={46} r={2} fill="#7A5530" />
      <G>
        <Circle cx={18} cy={66} r={11} fill="#0E5A4B" />
        <Path
          d="M13 66l4 4 7-8"
          stroke="#fff"
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
        />
      </G>
    </Svg>
  );
}

function BadPhoto() {
  return (
    <Svg width={120} height={84} viewBox="0 0 120 84" accessibilityElementsHidden>
      <Rect x={0} y={0} width={120} height={84} rx={10} fill="#3A3A38" />
      <Rect x={36} y={14} width={70} height={64} rx={3} fill="#6B5A45" opacity={0.45} />
      <Rect x={41} y={18} width={70} height={64} rx={3} fill="#6B5A45" opacity={0.35} />
      <Path d="M20 30l12-6M18 44l14-4" stroke="#888" strokeWidth={2} strokeLinecap="round" />
      <G>
        <Circle cx={18} cy={66} r={11} fill="#B3261E" />
        <Path d="M13 61l10 10M23 61l-10 10" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" />
      </G>
    </Svg>
  );
}

/** Ejemplos visuales: foto buena vs. foto mala. */
export function PhotoExamples() {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
      >
        <Text style={styles.link}>
          {open ? 'Ocultar ejemplos' : 'Ver cómo tomar una buena foto'}
        </Text>
      </Pressable>
      {open && (
        <View style={styles.examples}>
          <View style={styles.example}>
            <GoodPhoto />
            <Text style={styles.exampleTitle}>Así sí</Text>
            {PHOTO_TIPS.good.map((tip) => (
              <Text key={tip} style={styles.exampleTip}>
                • {tip}
              </Text>
            ))}
          </View>
          <View style={styles.example}>
            <BadPhoto />
            <Text style={styles.exampleTitle}>Así no</Text>
            {PHOTO_TIPS.bad.map((tip) => (
              <Text key={tip} style={styles.exampleTip}>
                • {tip}
              </Text>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

export const onboardingStyles = StyleSheet.create({
  input: {
    height: 56,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 18,
  },
  label: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.text },
  hint: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  field: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 16,
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.text },
  chipTextOn: { color: colors.onPrimary },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, gap: 16 },
  flex: { flex: 1 },
  header: { gap: 8 },
  stepLabel: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.textSecondary },
  progress: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.border },
  segmentOn: { backgroundColor: colors.primary },
  goal: { fontFamily: fonts.display, fontSize: 26, lineHeight: 32, color: colors.text },
  helpToggle: { paddingVertical: 6 },
  helpToggleText: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.primary },
  helpText: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    padding: 12,
  },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.md,
    padding: 12,
  },
  autosave: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  bigButton: { minHeight: 56 },
  row: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 14,
    gap: 10,
  },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rowTitle: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.text },
  secondary: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  status: {
    fontFamily: fonts.bodySemibold,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  statusDone: { backgroundColor: colors.primarySoft, color: colors.primary },
  statusPending: { backgroundColor: colors.amberSoft, color: colors.warningText },
  busy: { height: 48 },
  action: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.primary },
  section: { gap: 10 },
  sectionTitle: { fontFamily: fonts.bodySemibold, fontSize: 18, color: colors.text },
  note: { backgroundColor: colors.primarySoft, borderRadius: radii.md, padding: 12 },
  noteText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text },
  link: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.primary, paddingVertical: 6 },
  examples: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  example: { flex: 1, minWidth: 140, gap: 4 },
  exampleTitle: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.text },
  exampleTip: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
});
