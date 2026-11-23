import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, fonts, motion, touch } from '@/theme';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// "Reducir movimiento" del sistema: si está activo, el botón no se anima.
let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled()
  .then((v) => {
    reduceMotion = v;
  })
  .catch(() => undefined);

export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled,
  style,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;
  // Un valor animado por botón, creado una sola vez.
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => () => scale.stopAnimation(), [scale]);
  const animate = (to: number) => {
    if (reduceMotion) return;
    Animated.timing(scale, {
      toValue: to,
      duration: motion.fast,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPressIn={(e) => {
        animate(0.97);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        animate(1);
        onPressOut?.(e);
      }}
      style={[
        styles.base,
        styles[variant],
        isDisabled && styles.disabled,
        { transform: [{ scale }] },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onPrimary : colors.primary} />
      ) : (
        <Text style={[styles.label, labelStyles[variant]]}>{label}</Text>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touch.primary,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  // Brillo suave del color de acento: el toque "futurista" sin perder contraste.
  primary: {
    backgroundColor: colors.primary,
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  outline: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.borderStrong },
  ghost: { backgroundColor: 'transparent', minHeight: touch.min },
  danger: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.danger,
    minHeight: touch.min,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  disabled: { opacity: 0.5 },
  label: { fontFamily: fonts.bodySemibold, fontSize: 17 },
});

const labelStyles = StyleSheet.create({
  primary: { color: colors.onPrimary },
  outline: { color: colors.text },
  ghost: { color: colors.text, fontSize: 16 },
  danger: { color: colors.danger, fontSize: 15 },
});
