import { StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';

import { colors } from '@/theme';
import type { Point } from '@/lib/location';

type Props = { center: Point; radiusM?: number; height?: number; label?: string };

/** Mapa con la ubicación propia y el radio. Nunca muestra posiciones de otros usuarios. */
export function MapPreview({ center, radiusM, height = 220, label = 'Tu ubicación' }: Props) {
  const delta = Math.max(0.01, ((radiusM ?? 1500) / 111_000) * 2.6);
  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        region={{ ...center, latitudeDelta: delta, longitudeDelta: delta }}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        accessibilityLabel={`Mapa: ${label}`}
      >
        {radiusM ? (
          <Circle
            center={center}
            radius={radiusM}
            strokeColor={colors.primary}
            fillColor="rgba(14,90,75,0.10)"
          />
        ) : null}
        <Marker coordinate={center} title={label} pinColor={colors.primary} />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 20, overflow: 'hidden', backgroundColor: '#ECE8DD' },
});
