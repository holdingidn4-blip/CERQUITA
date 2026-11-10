import { describe, expect, it } from 'vitest';
import {
  approxPointWkt,
  commissionCents,
  distanceAndEta,
  etaMinutes,
  formatDistance,
  formatRate,
  formatRating,
  netCents,
  offerKind,
  quoteSuggestions,
  tradePlural,
  jobTitle,
} from './orders';

describe('commissionCents (igual que private.commission_cents)', () => {
  it.each([
    [9500, 1000, 950],
    [8000, 1000, 800],
    [8555, 1000, 855],
    [8556, 1000, 856],
    [8554, 1000, 855],
    [10000, 1200, 1200],
    [1, 1000, 0],
    [0, 1000, 0],
  ])('%i × %i bps = %i', (price, bps, expected) =>
    expect(commissionCents(price, bps)).toBe(expected),
  );

  it('precio − comisión = neto (pantalla 8: S/ 95 → S/ 85.50)', () => {
    expect(netCents(9500, 1000)).toBe(8550);
    expect(commissionCents(9500, 1000) + netCents(9500, 1000)).toBe(9500);
  });

  it('rechaza montos con decimales y tasas inválidas', () => {
    expect(() => commissionCents(95.5, 1000)).toThrow(TypeError);
    expect(() => commissionCents(9500, 10.5)).toThrow(RangeError);
    expect(() => commissionCents(9500, 20000)).toThrow(RangeError);
  });
});

describe('formatos', () => {
  it('tasa', () => {
    expect(formatRate(1000)).toBe('10 %');
    expect(formatRate(1250)).toBe('12,5 %');
  });
  it('distancia', () => {
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(1000)).toBe('1 km');
    expect(formatDistance(1250)).toBe('1,3 km');
    expect(formatDistance(null)).toBe('');
  });
  it('tiempo de llegada como en el diseño', () => {
    expect(etaMinutes(850)).toBe(6);
    expect(etaMinutes(760)).toBe(5);
    expect(etaMinutes(50)).toBe(1);
    expect(distanceAndEta(850)).toBe('850 m · llega en 6 min');
    expect(distanceAndEta(null)).toBe('');
  });
  it('calificación', () => {
    expect(formatRating(4.86)).toBe('4,9');
    expect(formatRating('4.7')).toBe('4,7');
    expect(formatRating(null)).toBe('Nuevo');
  });
});

describe('quoteSuggestions', () => {
  it('parte del precio del cliente y sube (pantalla 8: S/ 80 → 80, 90, 95, 100)', () => {
    expect(quoteSuggestions(8000)).toEqual([8000, 9000, 9500, 10000]);
  });
  it('nunca sugiere menos que el precio del cliente', () => {
    for (const price of [1000, 3550, 6000, 12000]) {
      expect(Math.min(...quoteSuggestions(price))).toBe(price);
    }
  });
});

describe('offerKind', () => {
  it('distingue el precio del cliente de una contraoferta', () => {
    expect(offerKind(8000, 8000)).toBe('client_price');
    expect(offerKind(9500, 8000)).toBe('counter');
  });
});

describe('approxPointWkt', () => {
  it('redondea a 3 decimales como el servidor', () => {
    expect(approxPointWkt(-12.12345, -77.03123)).toBe('SRID=4326;POINT(-77.031 -12.123)');
  });
  it('rechaza coordenadas inválidas', () => {
    expect(() => approxPointWkt(100, 0)).toThrow(RangeError);
  });
});

describe('tradePlural', () => {
  it.each([
    ['Gasfitero', 2, 'gasfiteros'],
    ['Electricista', 3, 'electricistas'],
    ['Pintor', 2, 'pintores'],
    ['Carpintero', 1, 'carpintero'],
    ['Hogar', 2, 'profesionales de hogar'],
    ['Hogar', 1, 'profesional de hogar'],
  ])('%s (%i) → %s', (name, n, expected) => expect(tradePlural(name, n)).toBe(expected));
});

describe('jobTitle', () => {
  it('usa la primera oración', () => {
    expect(jobTitle('Fuga bajo el lavadero. Gotea desde ayer.')).toBe('Fuga bajo el lavadero');
  });
  it('acorta textos largos', () => {
    expect(jobTitle('a'.repeat(60), 10)).toBe('aaaaaaaaa…');
  });
});
