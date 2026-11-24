import { OTP_LENGTH, type Role } from '@cerquita/shared';
import { useEffect, useState, type ComponentRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useReduceMotion } from '@/lib/motion';
import { colors, fonts, motion, radii, scheme } from '@/theme';

const native = Platform.OS !== 'web';

/** Fondo en degradado con dos brillos de acento (decorativos, detrás del contenido). */
export function GradientBackground() {
  const glow = scheme === 'dark' ? 0.32 : 0.16;
  return (
    <Svg
      width="100%"
      height="100%"
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      preserveAspectRatio="none"
    >
      <Defs>
        <LinearGradient id="fondo" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.background} />
          <Stop offset="1" stopColor={colors.surfaceMuted} />
        </LinearGradient>
        <RadialGradient id="brillo1" cx="85%" cy="8%" r="55%">
          <Stop offset="0" stopColor={colors.accent} stopOpacity={glow} />
          <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="brillo2" cx="5%" cy="55%" r="50%">
          <Stop offset="0" stopColor={colors.accentAlt} stopOpacity={glow * 0.8} />
          <Stop offset="1" stopColor={colors.accentAlt} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#fondo)" />
      <Rect width="100%" height="100%" fill="url(#brillo1)" />
      <Rect width="100%" height="100%" fill="url(#brillo2)" />
    </Svg>
  );
}

// Posiciones (en % del radar) y oficios de los profesionales simulados.
const DOTS = [
  { x: 0.18, y: 0.3, trade: 'Gasfitero' },
  { x: 0.74, y: 0.22, trade: 'Electricista' },
  { x: 0.62, y: 0.72, trade: 'Carpintero' },
  { x: 0.28, y: 0.74, trade: 'Pintor' },
  { x: 0.86, y: 0.5, trade: 'Limpieza' },
  { x: 0.1, y: 0.55, trade: 'Albañil' },
];

/** Radar con profesionales que "aparecen" cerca (simulado): animación corta de 300 ms por punto. */
export function ProsRadar() {
  const reduce = useReduceMotion();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [visible, setVisible] = useState<number[]>([0, 1, 2]);
  const [anims] = useState(() => DOTS.map(() => new Animated.Value(1)));

  useEffect(() => {
    if (reduce) return;
    let next = 3;
    const timer = setInterval(() => {
      const i = next % DOTS.length;
      next += 1;
      setVisible((prev) => [...prev.slice(-3), i]);
      anims[i]?.setValue(0);
      Animated.timing(anims[i] as Animated.Value, {
        toValue: 1,
        duration: motion.slow - 20,
        useNativeDriver: native,
      }).start();
    }, 1400);
    return () => clearInterval(timer);
  }, [reduce, anims]);

  return (
    <View
      style={styles.radar}
      onLayout={(e: LayoutChangeEvent) =>
        setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
      }
      accessible
      accessibilityLabel="Ejemplo de profesionales en línea cerca de ti"
    >
      {[0.9, 0.6, 0.3].map((r) => (
        <View
          key={r}
          style={[
            styles.ring,
            { width: size.h * r, height: size.h * r, borderRadius: (size.h * r) / 2 },
          ]}
        />
      ))}
      <View style={styles.me} />
      {size.w > 0 &&
        (reduce ? [0, 1, 2, 3] : visible).map((i) => {
          const dot = DOTS[i];
          if (!dot) return null;
          const a = anims[i] as Animated.Value;
          return (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                {
                  left: dot.x * size.w - 6,
                  top: dot.y * size.h - 6,
                  opacity: a,
                  transform: [
                    { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
                  ],
                },
              ]}
            >
              <View style={styles.dotCore} />
              <Text style={styles.dotLabel}>{dot.trade}</Text>
            </Animated.View>
          );
        })}
      <Text style={styles.radarCaption}>Ejemplo · profesionales en línea cerca de ti</Text>
    </View>
  );
}

const MESSAGES = ['Profesionales verificados', 'Precio transparente', 'Seguimiento en vivo'];

/** Mensajes cortos que rotan (fundido de 200 ms). Con "reducir movimiento" se muestran todos. */
export function RotatingMessage() {
  const reduce = useReduceMotion();
  const [i, setI] = useState(0);
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduce) return;
    const timer = setInterval(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: motion.base,
        useNativeDriver: native,
      }).start(() => {
        setI((v) => (v + 1) % MESSAGES.length);
        Animated.timing(opacity, {
          toValue: 1,
          duration: motion.base,
          useNativeDriver: native,
        }).start();
      });
    }, 2600);
    return () => clearInterval(timer);
  }, [reduce, opacity]);

  if (reduce) {
    return (
      <View style={styles.pills}>
        {MESSAGES.map((m) => (
          <Text key={m} style={styles.pill}>
            ✓ {m}
          </Text>
        ))}
      </View>
    );
  }
  return (
    <View accessible accessibilityLabel={MESSAGES.join('. ')} style={styles.pills}>
      <Animated.Text style={[styles.pill, { opacity }]} importantForAccessibility="no">
        ✓ {MESSAGES[i]}
      </Animated.Text>
    </View>
  );
}

const ROLES: { value: Role; label: string; benefits: string[] }[] = [
  {
    value: 'client',
    label: 'Necesito un servicio',
    benefits: [
      'Tú pones el precio y comparas ofertas',
      'Profesionales verificados por oficio',
      'Ves su llegada en vivo y pagas al terminar',
    ],
  },
  {
    value: 'pro',
    label: 'Ofrezco mis servicios',
    benefits: [
      'Recibe pedidos cerca de ti',
      'Cobras directo: comisión solo sobre la mano de obra',
      'Sube de nivel con trabajos y capacitaciones',
    ],
  },
];

/** Interruptor grande Cliente / Profesional con indicador que se desliza (250 ms). */
export function RoleSwitch({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  const reduce = useReduceMotion();
  const [width, setWidth] = useState(0);
  const [x] = useState(() => new Animated.Value(value === 'client' ? 0 : 1));
  useEffect(() => {
    Animated.timing(x, {
      toValue: value === 'client' ? 0 : 1,
      duration: reduce ? 0 : motion.base + 50,
      useNativeDriver: native,
    }).start();
  }, [value, reduce, x]);
  const current = ROLES.find((r) => r.value === value) ?? ROLES[0];

  return (
    <View style={styles.roleBox}>
      <Text style={styles.label}>¿Cómo quieres usar Cerquita?</Text>
      <View
        style={styles.switch}
        accessibilityRole="radiogroup"
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {width > 0 && (
          <Animated.View
            style={[
              styles.thumb,
              {
                width: (width - 8) / 2,
                transform: [
                  {
                    translateX: x.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, (width - 8) / 2],
                    }),
                  },
                ],
              },
            ]}
          />
        )}
        {ROLES.map((r) => {
          const on = r.value === value;
          return (
            <Pressable
              key={r.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(r.value)}
              style={styles.option}
            >
              <Text style={[styles.optionText, on && styles.optionTextOn]}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.benefits} testID="beneficios">
        {current?.benefits.map((b) => (
          <View key={b} style={styles.benefit}>
            <Text style={styles.benefitCheck}>✓</Text>
            <Text style={styles.benefitText}>{b}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Código de 6 dígitos en casillas. Un solo campo invisible encima recibe el teclado y el
 * autocompletado del SMS en Android (`autoComplete="sms-otp"`).
 */
export function OtpBoxes({
  value,
  onChange,
  onSubmit,
  labelledBy,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  labelledBy: string;
  inputRef: React.RefObject<ComponentRef<typeof TextInput> | null>;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable style={styles.otpRow} onPress={() => inputRef.current?.focus()} accessible={false}>
      {Array.from({ length: OTP_LENGTH }, (_, i) => {
        const active = focused && i === Math.min(value.length, OTP_LENGTH - 1);
        return (
          <View key={i} style={[styles.otpBox, active && styles.otpBoxActive]}>
            <Text style={styles.otpDigit}>{value[i] ?? ''}</Text>
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        accessibilityLabelledBy={labelledBy}
        style={styles.otpInput}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, OTP_LENGTH))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={OTP_LENGTH}
        onSubmitEditing={onSubmit}
        caretHidden
      />
    </Pressable>
  );
}

/** Animación de éxito al ingresar (check que crece en 300 ms). */
export function SuccessCheck() {
  const reduce = useReduceMotion();
  const [s] = useState(() => new Animated.Value(0.3));
  useEffect(() => {
    Animated.timing(s, {
      toValue: 1,
      duration: reduce ? 0 : motion.slow - 20,
      useNativeDriver: native,
    }).start();
  }, [s, reduce]);
  return (
    <Animated.View
      style={[styles.success, { opacity: s, transform: [{ scale: s }] }]}
      accessibilityRole="alert"
      accessibilityLabel="Listo, ingresaste"
    >
      <Text style={styles.successMark}>✓</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  radar: {
    height: 150,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ring: { position: 'absolute', borderWidth: 1, borderColor: colors.border },
  me: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.primarySoft,
  },
  dot: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 4 },
  dotCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  dotLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: 11,
    color: colors.text,
    backgroundColor: colors.surface,
    paddingHorizontal: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  radarCaption: {
    position: 'absolute',
    bottom: 8,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    fontFamily: fonts.bodySemibold,
    fontSize: 14,
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  roleBox: { gap: 10 },
  label: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.text },
  switch: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: {
    position: 'absolute',
    top: 4,
    left: 4,
    bottom: 4,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 2,
  },
  option: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', padding: 6 },
  optionText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 15,
    color: colors.text,
    textAlign: 'center',
  },
  optionTextOn: { color: colors.onPrimary },
  benefits: { gap: 6 },
  benefit: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  benefitCheck: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.primary },
  benefitText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
  },
  otpRow: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  otpBox: {
    flex: 1,
    height: 58,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxActive: { borderColor: colors.primary, borderWidth: 2.5 },
  otpDigit: { fontFamily: fonts.display, fontSize: 26, color: colors.text },
  otpInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.01,
    color: 'transparent',
  },
  success: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successMark: { fontFamily: fonts.display, fontSize: 36, color: colors.onPrimary },
});
