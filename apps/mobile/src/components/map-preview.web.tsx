import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme';
import type { Point } from '@/lib/location';

type Props = { center: Point; radiusM?: number; height?: number; label?: string };

/** En web no hay react-native-maps: se muestra un marcador simple con el radio. */
export function MapPreview({ radiusM, height = 220, label = 'Tu ubicación' }: Props) {
  return (
    <View style={[styles.wrap, { height }]} accessibilityLabel={`Mapa: ${label}`}>
      <View style={styles.halo}>
        <View style={styles.dot} />
      </View>
      <Text style={styles.text}>
        {label}
        {radiusM ? ` · radio ${radiusM >= 1000 ? `${radiusM / 1000} km` : `${radiusM} m`}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 20,
    backgroundColor: '#ECE8DD',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  halo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(14,90,75,.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: '#fff',
  },
  text: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textSecondary },
});
