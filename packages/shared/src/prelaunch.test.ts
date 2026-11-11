import { describe, expect, it } from 'vitest';
import { formatSchedule, laterTodayOptions, limaDate, scheduleDayOptions } from './prelaunch';

describe('programación del pedido (hora de Lima)', () => {
  it('limaDate convierte a UTC', () => {
    expect(limaDate(2026, 11, 12, 10).toISOString()).toBe('2026-11-12T15:00:00.000Z');
  });
  it('“Hoy más tarde” empieza 2 h después y termina a las 21:00', () => {
    const now = limaDate(2026, 11, 11, 15, 20);
    const opts = laterTodayOptions(now);
    expect(formatSchedule(opts[0] as Date, 'later_today')).toBe('Hoy, 17:00');
    expect(formatSchedule(opts.at(-1) as Date, 'later_today')).toBe('Hoy, 21:00');
    expect(laterTodayOptions(limaDate(2026, 11, 11, 20, 30))).toEqual([]);
  });
  it('días para programar: mañana y 6 más (cruza de mes)', () => {
    const days = scheduleDayOptions(limaDate(2026, 11, 28, 9));
    expect(days[0]).toEqual({ y: 2026, m: 11, d: 29 });
    expect(days.at(-1)).toEqual({ y: 2026, m: 12, d: 5 });
  });
  it('formato legible', () => {
    expect(formatSchedule(limaDate(2026, 11, 17, 10), 'scheduled')).toBe('mar 17 nov, 10:00');
    expect(formatSchedule(null, 'now')).toBe('Ahora');
  });
});
