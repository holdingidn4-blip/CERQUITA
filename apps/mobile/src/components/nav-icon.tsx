import type { ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/** Íconos de línea de la barra inferior (24×24, mismo trazo que los de oficios). */
const PATHS = {
  inicio: 'M3.5 11 12 4l8.5 7 M5.5 9.5V20h13V9.5 M10 20v-5.5h4V20',
  pedidos: 'M8 4.5h8 M7 6.5h10v14H7z M9.5 10.5h5 M9.5 14h5 M9.5 17.5h3',
  ganancias: 'M3.5 7.5h17v11h-17z M3.5 11h17 M15.5 15h2',
  capacitaciones: 'M2.5 9.5 12 5l9.5 4.5L12 14z M6.5 11.5v4.5c3 2 8 2 11 0v-4.5 M21.5 9.5v5',
  perfil: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 20.5c1.5-3.5 4.3-5 7.5-5s6 1.5 7.5 5',
} as const;

export type NavIconName = keyof typeof PATHS;

export function NavIcon({
  name,
  color,
  size = 24,
}: {
  name: NavIconName;
  color: ColorValue;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
      <Path
        d={PATHS[name]}
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
