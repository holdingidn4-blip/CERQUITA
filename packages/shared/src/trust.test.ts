import { describe, expect, it } from 'vitest';
import { chatViolation, hoursLeft, pointsDiscount, pointsEarned, proLevel } from './trust';

describe('chatViolation (igual que private.chat_violation)', () => {
  it.each([
    ['Mi número es 987 654 321', 'phone'],
    ['llama al 9-8-7-6-5-4-3-2-1', 'phone'],
    ['+51 (987) 654.321', 'phone'],
    ['escríbeme: rosa.v@gmail.com', 'email'],
    ['rosa arroba gmail punto com', 'email'],
    ['Pásame tu WhatsApp', 'keyword'],
    ['mándame al wsp', 'keyword'],
    ['Llámame al rato', 'keyword'],
    ['págame por fuera y te hago descuento', 'keyword'],
    ['Toca el timbre del 302, llego en 15 min', null],
    ['El repuesto cuesta S/ 120.50', null],
  ])('"%s" → %s', (text, expected) => expect(chatViolation(text)).toBe(expected));
});

describe('Puntos Cerquita', () => {
  it('gana 1 punto por S/ 1 de mano de obra', () => expect(pointsEarned(20050, 1)).toBe(200));
  it('el descuento tiene tope del 20 % de la mano de obra (igual que apply_points)', () => {
    expect(pointsDiscount(1000, 200, 10000, 5, 20)).toEqual({ points: 200, discountCents: 1000 });
    expect(pointsDiscount(1000, 5000, 10000, 5, 20)).toEqual({ points: 400, discountCents: 2000 });
    expect(pointsDiscount(-5, 100, 10000, 5, 20)).toEqual({ points: 0, discountCents: 0 });
  });
});

describe('ranking y video temporal', () => {
  it('niveles', () => {
    expect(proLevel(0).name).toBe('Nuevo');
    expect(proLevel(100)).toEqual({ name: 'Bronce', next: 250 });
    expect(proLevel(700).name).toBe('Oro');
  });
  it('horas que faltan', () => {
    const now = new Date('2026-11-11T12:00:00Z');
    expect(hoursLeft('2026-11-13T11:30:00Z', now)).toBe(48);
    expect(hoursLeft('2026-11-11T11:00:00Z', now)).toBe(0);
    expect(hoursLeft(null, now)).toBe(0);
  });
});
