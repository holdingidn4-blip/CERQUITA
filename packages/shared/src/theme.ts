/** Tokens de diseño tomados de design/README.md. */
export const colors = {
  primary: '#0E5A4B',
  background: '#F6F3EC',
  surface: '#FFFFFF',
  text: '#17231F',
  textSecondary: '#56625C',
  border: '#E1DCCF',
  amber: '#F2B33D',
  amberSoft: '#FBEBC8',
  danger: '#B3261E',
  dangerSoft: '#FBE4E1',
} as const;

export const fontFamilies = {
  display: 'Space Grotesk',
  body: 'Inter',
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
  pill: 999,
} as const;
