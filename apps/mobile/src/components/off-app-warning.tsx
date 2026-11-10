import { OFF_APP_WARNING } from '@cerquita/shared';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii } from '@/theme';

/** Aviso antifraude visible para cliente y profesional. */
export function OffAppWarning() {
  return (
    <View style={styles.box} accessibilityRole="alert">
      <Text style={styles.text}>{OFF_APP_WARNING}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.amberSoft,
    borderRadius: radii.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.amber,
  },
  text: { fontFamily: fonts.bodySemibold, fontSize: 13, lineHeight: 19, color: '#5C4410' },
});
