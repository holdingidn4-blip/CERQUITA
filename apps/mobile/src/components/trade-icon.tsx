import Svg, { Path } from 'react-native-svg';

import { colors } from '@/theme';

/** Trazos de 24×24 por oficio (slug de `trades`). Íconos de línea propios de Cerquita. */
const PATHS: Record<string, string> = {
  // gota de agua
  gasfiteria:
    'M12 3.5C12 3.5 6 10.2 6 14.2a6 6 0 0 0 12 0C18 10.2 12 3.5 12 3.5z M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5',
  // rayo
  electricidad: 'M13 2.5 5 13.5h6l-1 8 8-11h-6l1-8z',
  // casa con puerta
  hogar: 'M3.5 11 12 4l8.5 7 M5.5 9.5V20h13V9.5 M10 20v-5.5h4V20',
  // ladrillos
  albanileria: 'M3.5 6h17v12h-17z M3.5 10h17 M3.5 14h17 M9 6v4 M15 10v4 M9 14v4',
  // martillo
  carpinteria: 'M13.5 4.5l5 5-2.5 2.5-5-5z M11.5 8.5 4 16l3 3 7.5-7.5',
  // rodillo de pintura
  pintura: 'M4 4.5h12v4.5H4z M16 6.75h3.5v5H11v3 M10 14.75h2V20h-2z',
  // destellos de limpieza
  limpieza:
    'M12 3.5v4 M12 16.5v4 M3.5 12h4 M16.5 12h4 M6.5 6.5l2.5 2.5 M15 15l2.5 2.5 M6.5 17.5 9 15 M15 9l2.5-2.5',
  // corazón
  cuidado: 'M12 19.5s-7-4.4-7-9.6A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 7 2.3c0 5.2-7 9.6-7 9.6z',
  // auto
  chofer:
    'M4 16.5 6 10.5h12l2 6v2.5H4z M6.5 19v1.5 M17.5 19v1.5 M7.5 14h1 M15.5 14h1 M7.5 10.5 9 7h6l1.5 3.5',
};

export function TradeIcon({
  slug,
  size = 28,
  color = colors.primary,
}: {
  slug: string;
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path
        d={PATHS[slug] ?? 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16z'}
        fill="none"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
