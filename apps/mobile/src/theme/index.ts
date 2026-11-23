import { motion, palettes, radii, spacing, touch, typography } from '@cerquita/shared';
import { Appearance } from 'react-native';

/**
 * Modo claro u oscuro según el sistema al abrir la app. Los estilos se crean una vez con esta paleta;
 * si la persona cambia el modo con la app abierta, `_layout` recarga la app para aplicarlo.
 */
export const scheme: 'light' | 'dark' = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
export const colors = palettes[scheme];

export { motion, radii, spacing, touch, typography };

/** Nombres de fuentes tal como se registran con useFonts en app/_layout.tsx. */
export const fonts = {
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_500Medium',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
} as const;
