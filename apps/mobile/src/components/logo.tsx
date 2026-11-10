import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors, fonts } from '@/theme';

export function Logo() {
  return (
    <View style={styles.row}>
      <View style={styles.badge}>
        <Svg
          width={26}
          height={26}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21z" />
          <Path d="M9.5 10.2 12 8l2.5 2.2v2.6h-5z" />
        </Svg>
      </View>
      <Text style={styles.name}>Cerquita</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontFamily: fonts.display, fontSize: 32, letterSpacing: -0.5, color: colors.text },
});
