import { initials } from '@cerquita/shared';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

export function InitialsAvatar({ name, size = 44 }: { name: string | null; size?: number }) {
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.text, { fontSize: size * 0.34 }]}>{initials(name) || '·'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: fonts.display, color: colors.surface },
});
