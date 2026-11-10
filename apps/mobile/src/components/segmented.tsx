import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** "solid": botones grandes de la pantalla de ingreso. "pill": selector de Ajustes. */
  look?: 'solid' | 'pill';
  disabled?: boolean;
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  look = 'solid',
  disabled,
}: Props<T>) {
  const pill = look === 'pill';
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.grid, pill && styles.pillTrack]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={[
              styles.item,
              pill ? styles.pillItem : styles.solidItem,
              selected && (pill ? styles.pillSelected : styles.solidSelected),
            ]}
          >
            <Text style={[styles.text, selected && !pill && styles.solidSelectedText]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 8 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  solidItem: {
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#D5D0C3',
    backgroundColor: colors.surface,
  },
  solidSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  solidSelectedText: { color: colors.surface },
  pillTrack: { padding: 4, borderRadius: 14, backgroundColor: '#ECE8DD' },
  pillItem: { height: 44, borderRadius: 11 },
  pillSelected: {
    backgroundColor: colors.surface,
    shadowColor: colors.text,
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  text: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.text, textAlign: 'center' },
});
