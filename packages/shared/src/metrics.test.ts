import { describe, expect, it } from 'vitest';
import { dayLabel, formatDuration, formatShare, metricWindow, niceTicks, shareOf } from './metrics';

describe('metricWindow', () => {
  it.each([
    ['7', 7],
    ['30', 30],
    [['90', '7'], 90],
    ['15', 14],
    [undefined, 14],
    ['abc', 14],
  ])('%j → %i días', (value, expected) => expect(metricWindow(value)).toBe(expected));
});

describe('shareOf y formatShare', () => {
  it('redondea al entero', () => {
    expect(shareOf(1, 3)).toBe(33);
    expect(shareOf(2, 3)).toBe(67);
    expect(formatShare(3, 6)).toBe('50 %');
  });
  it('sin base no inventa un 0 %', () => {
    expect(shareOf(0, 0)).toBeNull();
    expect(formatShare(0, 0)).toBe('—');
  });
});

describe('formatDuration', () => {
  it.each([
    [null, '—'],
    [0.4, 'menos de 1 min'],
    [12.4, '12 min'],
    [65, '1 h 5 min'],
    [120, '2 h'],
  ])('%j → %s', (minutes, expected) => expect(formatDuration(minutes)).toBe(expected));
});

describe('niceTicks', () => {
  it.each([
    [0, [0, 1]],
    [3, [0, 1, 2, 3]],
    [7, [0, 2, 4, 6, 8]],
    [8, [0, 2, 4, 6, 8]],
    [45, [0, 20, 40, 60]],
    [100, [0, 50, 100]],
  ])('máximo %i → %j', (max, expected) => expect(niceTicks(max)).toEqual(expected));
  it('la última marca siempre cubre el máximo', () => {
    for (let max = 0; max <= 500; max += 7) {
      const ticks = niceTicks(max);
      expect(ticks.at(-1)).toBeGreaterThanOrEqual(max);
      expect(ticks.length).toBeLessThanOrEqual(6);
    }
  });
});

describe('dayLabel', () => {
  it('día/mes', () => expect(dayLabel('2026-11-09')).toBe('09/11'));
});
