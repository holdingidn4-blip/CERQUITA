import { describe, expect, it } from 'vitest';
import { formatSoles, parseSolesToCents } from './money';

describe('formatSoles', () => {
  it('formatea céntimos como soles', () => {
    expect(formatSoles(0)).toBe('S/ 0.00');
    expect(formatSoles(5)).toBe('S/ 0.05');
    expect(formatSoles(4550)).toBe('S/ 45.50');
    expect(formatSoles(3000)).toBe('S/ 30.00');
    expect(formatSoles(120000)).toBe('S/ 1,200.00');
    expect(formatSoles(-250)).toBe('-S/ 2.50');
  });

  it('rechaza montos que no son enteros', () => {
    expect(() => formatSoles(45.5)).toThrow(TypeError);
    expect(() => formatSoles(Number.NaN)).toThrow(TypeError);
  });
});

describe('parseSolesToCents', () => {
  it.each([
    ['45', 4500],
    ['45.5', 4550],
    ['45,50', 4550],
    ['S/ 80', 8000],
    ['s/45.05', 4505],
    ['1,200.00', 120000],
    ['0.10', 10],
    ['1,20', 120],
  ])('"%s" → %i', (input, expected) => {
    expect(parseSolesToCents(input)).toBe(expected);
  });

  it.each(['', 'abc', '45.555', '-10', '4 5.0.0'])('"%s" no es válido', (input) => {
    expect(parseSolesToCents(input)).toBeNull();
  });

  it('no pierde precisión como haría el punto flotante', () => {
    // 0.29 * 100 = 28.999999999999996 en punto flotante
    expect(parseSolesToCents('0.29')).toBe(29);
    expect(parseSolesToCents('19.99')).toBe(1999);
  });
});
