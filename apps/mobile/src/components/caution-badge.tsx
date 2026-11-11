import { StyleSheet, Text } from 'react-native';

import { colors, fonts } from '@/theme';

/** Aviso discreto para técnicos: la zona tiene antecedentes registrados por soporte (sin detalles). */
export function CautionBadge() {
  return (
    <Text
      style={styles.badge}
      accessibilityLabel="Precaución: zona con antecedentes"
      testID="aviso-precaucion"
    >
      ⚠ Precaución en esta dirección · coordina todo por el chat
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: '#7A5A12',
    backgroundColor: colors.amberSoft,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
});
