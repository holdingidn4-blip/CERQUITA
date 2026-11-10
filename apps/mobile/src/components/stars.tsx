import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';

export function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Calificación">
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          accessibilityRole="radio"
          accessibilityLabel={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`}
          accessibilityState={{ selected: value === n }}
          onPress={() => onChange(n)}
        >
          <Text style={[styles.star, n <= value && styles.on]}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  star: { fontSize: 40, color: '#D5D0C3' },
  on: { color: colors.amber },
});
