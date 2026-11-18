import { describe, expect, it } from 'vitest';
import { arrivalState, ETA_OPTIONS, formatArrival } from './noshow';
import { limaDate } from './prelaunch';

describe('llegada acordada y cambio de profesional', () => {
  const promised = limaDate(2026, 11, 18, 10, 30);
  const at = (h: number, m: number) => limaDate(2026, 11, 18, h, m);

  it('sin hora acordada no hay estado', () => {
    expect(arrivalState(null, 15, at(10, 0))).toEqual({ kind: 'none' });
  });
  it('antes de la hora: a tiempo, con minutos restantes redondeados hacia arriba', () => {
    expect(arrivalState(promised, 15, at(10, 10))).toEqual({ kind: 'on_time', minutesLeft: 20 });
  });
  it('pasada la hora pero dentro de la tolerancia: atrasado, todavía sin cambio', () => {
    expect(arrivalState(promised, 15, at(10, 44))).toEqual({ kind: 'late', minutesLate: 14 });
  });
  it('al cumplirse la tolerancia el cliente puede cambiar (igual que el servidor)', () => {
    expect(arrivalState(promised, 15, at(10, 45))).toEqual({ kind: 'can_switch', minutesLate: 15 });
    expect(arrivalState(promised.toISOString(), 0, at(10, 30))).toEqual({
      kind: 'can_switch',
      minutesLate: 0,
    });
  });
  it('hora de llegada: solo la hora si es hoy, con fecha si es otro día', () => {
    expect(formatArrival(promised, at(9, 0))).toBe('10:30');
    expect(formatArrival(limaDate(2026, 11, 20, 9, 0), at(9, 0))).toBe('vie 20 nov, 09:00');
  });
  it('opciones de llegada dentro del rango del servidor (5 a 240 min)', () => {
    expect(ETA_OPTIONS.every((m) => m >= 5 && m <= 240)).toBe(true);
  });
});
