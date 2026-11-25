import { filterCatalog } from '@cerquita/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fonts, radii } from '@/theme';

export type PickerItem = { id: number; name: string; searchTerms: string; requiresReview: boolean };

/**
 * Lista de trabajos de un oficio con buscador (sin tildes, por nombre o palabras como "caño").
 * Los trabajos de riesgo llevan la marca "revisión aparte".
 */
export function SpecialtyPicker({
  items,
  selected,
  onToggle,
  multiple = true,
  emptyText,
  riskNote = true,
  initialVisible,
  testID,
}: {
  items: PickerItem[];
  selected: number[];
  onToggle: (id: number) => void;
  multiple?: boolean;
  emptyText: string;
  /** Muestra la marca y la explicación de los trabajos de riesgo (pantallas del profesional). */
  riskNote?: boolean;
  /** Sin buscar, muestra solo estos primeros (más los elegidos) y un botón "Ver todos". */
  initialVisible?: number;
  testID?: string;
}) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const found = filterCatalog(items, query);
  const limited =
    initialVisible !== undefined &&
    !showAll &&
    query.trim() === '' &&
    items.length > initialVisible;
  const shown = limited
    ? found.filter((item, i) => i < initialVisible || selected.includes(item.id))
    : found;
  const hasRisky = riskNote && items.some((i) => i.requiresReview);
  return (
    <View style={styles.wrap} testID={testID}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Busca: fuga, terma, chapa…"
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel="Buscar trabajo"
        style={styles.search}
        autoCorrect={false}
        returnKeyType="search"
        testID={testID ? `${testID}-buscar` : undefined}
      />
      {hasRisky && (
        <Text style={styles.note}>
          Los marcados con «Revisión aparte» son de riesgo: Cerquita los aprueba uno por uno.
        </Text>
      )}
      <View style={styles.chips} accessibilityRole={multiple ? undefined : 'radiogroup'}>
        {shown.map((item) => {
          const on = selected.includes(item.id);
          return (
            <Pressable
              key={item.id}
              accessibilityRole={multiple ? 'checkbox' : 'radio'}
              accessibilityState={multiple ? { checked: on } : { selected: on }}
              accessibilityLabel={
                riskNote && item.requiresReview ? `${item.name}, revisión aparte` : item.name
              }
              onPress={() => onToggle(item.id)}
              style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{item.name}</Text>
              {riskNote && item.requiresReview && (
                <Text style={[styles.risk, on && styles.chipTextOn]}>Revisión aparte</Text>
              )}
            </Pressable>
          );
        })}
      </View>
      {limited && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowAll(true)}
          style={styles.more}
          testID={testID ? `${testID}-todos` : undefined}
        >
          <Text style={styles.moreText}>Ver los {items.length} trabajos</Text>
        </Pressable>
      )}
      {shown.length === 0 && <Text style={styles.empty}>{emptyText}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  search: {
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
  },
  note: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { opacity: 0.85 },
  chipText: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.text },
  chipTextOn: { color: colors.onPrimary },
  more: { minHeight: 44, justifyContent: 'center' },
  moreText: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.primary },
  risk: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.warningText },
  empty: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textSecondary,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    padding: 12,
  },
});
