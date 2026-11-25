/**
 * Tokens de diseño únicos (F5) para la app, el panel y la landing. Base neutra con acentos vivos:
 * verde Cerquita en modo claro y menta neón en modo oscuro. Cada par de texto y fondo cumple WCAG AA
 * (lo comprueba theme.test.ts con `contrastRatio`).
 */
export type ThemePalette = {
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textSecondary: string;
  border: string;
  /** Bordes de campos y controles: ≥ 3:1 sobre la superficie (WCAG 1.4.11). */
  borderStrong: string;
  primary: string;
  primaryStrong: string;
  onPrimary: string;
  primarySoft: string;
  /** Solo decorativo (degradados, brillos): nunca como color de texto. */
  accent: string;
  /** Segundo acento decorativo (violeta) para brillos del ingreso y la landing. */
  accentAlt: string;
  amber: string;
  amberSoft: string;
  warningText: string;
  danger: string;
  dangerSoft: string;
  successSoft: string;
  infoSoft: string;
  infoText: string;
  gradientStart: string;
  gradientEnd: string;
  overlay: string;
};

export const palettes: Record<'light' | 'dark', ThemePalette> = {
  light: {
    background: '#F3F6F4',
    surface: '#FFFFFF',
    surfaceMuted: '#E9EFEC',
    text: '#0E1B17',
    textSecondary: '#4B5B55',
    border: '#D3DDD8',
    borderStrong: '#7E9089',
    primary: '#00735C',
    primaryStrong: '#005A48',
    onPrimary: '#FFFFFF',
    primarySoft: '#D7F2EA',
    accent: '#00D1A8',
    accentAlt: '#7C5CFF',
    amber: '#F2B33D',
    amberSoft: '#FFF0CF',
    warningText: '#6B4700',
    danger: '#C0222B',
    dangerSoft: '#FDE6E7',
    successSoft: '#D7F2EA',
    infoSoft: '#E1ECFA',
    infoText: '#1D4A80',
    gradientStart: '#00735C',
    gradientEnd: '#00A889',
    overlay: 'rgba(14, 27, 23, 0.55)',
  },
  dark: {
    background: '#0A1210',
    surface: '#111C19',
    surfaceMuted: '#182824',
    text: '#ECF5F1',
    textSecondary: '#A9BBB4',
    border: '#263832',
    borderStrong: '#62796F',
    primary: '#3BE8BC',
    primaryStrong: '#7DF5D6',
    onPrimary: '#032019',
    primarySoft: '#0F3B31',
    accent: '#7DF9FF',
    accentAlt: '#B79CFF',
    amber: '#F7C35A',
    amberSoft: '#3B2C0C',
    warningText: '#FFD88A',
    danger: '#FF7A7A',
    dangerSoft: '#3D1517',
    successSoft: '#0F3B31',
    infoSoft: '#13263E',
    infoText: '#9CC7FF',
    gradientStart: '#3BE8BC',
    gradientEnd: '#7DF9FF',
    overlay: 'rgba(0, 0, 0, 0.6)',
  },
};

/** Modo claro (compatibilidad: la app elige el modo con `palettes`). */
export const colors = palettes.light;

export const fontFamilies = {
  display: 'Space Grotesk',
  body: 'Inter',
} as const;

/** Escala de texto: nada por debajo de 14 px para lectura cómoda. */
export const typography = {
  caption: 14,
  body: 16,
  bodyLarge: 18,
  title: 22,
  headline: 28,
  display: 36,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/** Área táctil mínima (botones y filas): 48 px; botón principal 56 px. */
export const touch = { min: 48, primary: 56 } as const;

/** Microanimaciones cortas (ms). Con "reducir movimiento" se omiten. */
export const motion = { fast: 120, base: 200, slow: 320 } as const;

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r ?? 0) + 0.7152 * f(g ?? 0) + 0.0722 * f(b ?? 0);
}

/** Contraste WCAG 2.x entre dos colores hex (#RRGGBB): de 1 a 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Pares de texto sobre fondo que la interfaz usa y deben cumplir AA (4,5:1). */
export const TEXT_PAIRS: [keyof ThemePalette, keyof ThemePalette][] = [
  ['text', 'background'],
  ['text', 'surface'],
  ['text', 'surfaceMuted'],
  ['text', 'primarySoft'],
  ['text', 'amberSoft'],
  ['text', 'dangerSoft'],
  ['textSecondary', 'background'],
  ['textSecondary', 'surface'],
  ['textSecondary', 'surfaceMuted'],
  ['primary', 'surface'],
  ['primary', 'background'],
  ['primary', 'primarySoft'],
  ['onPrimary', 'primary'],
  ['warningText', 'amberSoft'],
  ['warningText', 'surface'],
  ['danger', 'surface'],
  ['danger', 'dangerSoft'],
  ['infoText', 'infoSoft'],
];

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Variables CSS para el panel y la landing: claro por defecto y oscuro según el sistema. */
export function themeCss(): string {
  const vars = (p: ThemePalette) =>
    Object.entries(p)
      .map(([k, v]) => `--${kebab(k)}:${v};`)
      .join('');
  return `:root{${vars(palettes.light)}color-scheme:light dark;}@media (prefers-color-scheme: dark){:root{${vars(palettes.dark)}}}`;
}
