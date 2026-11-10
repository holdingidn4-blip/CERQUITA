import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { colors, fonts } from '@/theme';

type Props = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  loading?: boolean;
};

export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled,
  style,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={(state) => [
        styles.base,
        styles[variant],
        isDisabled && styles.disabled,
        state.pressed && styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.surface : colors.primary} />
      ) : (
        <Text style={[styles.label, labelStyles[variant]]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primary: { backgroundColor: colors.primary },
  outline: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: '#D5D0C3' },
  ghost: { backgroundColor: 'transparent', height: 44 },
  danger: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.danger,
    height: 44,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  label: { fontFamily: fonts.bodySemibold, fontSize: 16 },
});

const labelStyles = StyleSheet.create({
  primary: { color: colors.surface },
  outline: { color: colors.text },
  ghost: { color: '#2F3B36', fontSize: 15 },
  danger: { color: colors.danger, fontSize: 14 },
});
