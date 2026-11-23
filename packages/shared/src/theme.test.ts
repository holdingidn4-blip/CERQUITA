import { describe, expect, it } from 'vitest';

import { contrastRatio, palettes, TEXT_PAIRS, themeCss } from './theme';

describe('contraste WCAG AA de los tokens', () => {
  it('calcula el contraste como WCAG', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  for (const mode of ['light', 'dark'] as const) {
    const p = palettes[mode];
    it(`modo ${mode}: todo texto sobre su fondo ≥ 4,5:1`, () => {
      const failing = TEXT_PAIRS.filter(([fg, bg]) => contrastRatio(p[fg], p[bg]) < 4.5).map(
        ([fg, bg]) => `${fg}/${bg} = ${contrastRatio(p[fg], p[bg]).toFixed(2)}`,
      );
      expect(failing).toEqual([]);
    });
    it(`modo ${mode}: bordes de campos ≥ 3:1 (WCAG 1.4.11)`, () => {
      expect(contrastRatio(p.borderStrong, p.surface)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(p.borderStrong, p.background)).toBeGreaterThanOrEqual(3);
    });
  }
});

describe('variables CSS para el panel y la landing', () => {
  it('claro por defecto y oscuro según el sistema', () => {
    const css = themeCss();
    expect(css).toContain(`--primary:${palettes.light.primary};`);
    expect(css).toContain('--text-secondary:');
    expect(css).toContain(
      `@media (prefers-color-scheme: dark){:root{--background:${palettes.dark.background};`,
    );
  });
});
