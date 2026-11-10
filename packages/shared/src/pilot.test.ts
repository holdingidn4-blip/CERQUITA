import { describe, expect, it } from 'vitest';
import {
  breakdown,
  formatMoney,
  isWithinRateCard,
  materialsTotal,
  rateCardSuggestions,
  unitPriceLabel,
} from './pilot';
import { tradePlural } from './orders';
import { isTrackingStatus, serviceStepIndex, trackingIntervalMs } from './service';

describe('comisión solo sobre mano de obra', () => {
  it('los materiales quedan exentos', () => {
    // S/ 90 de mano de obra + S/ 35.30 de materiales, 10 %
    expect(breakdown(9000, 3530, 1000)).toEqual({
      laborCents: 9000,
      materialsCents: 3530,
      totalCents: 12530,
      commissionCents: 900,
      proReceivesCents: 11630,
    });
  });
  it('sin materiales es igual que antes', () => {
    expect(breakdown(9500, 0, 1000).commissionCents).toBe(950);
  });
  it('más materiales no cambian la comisión', () => {
    expect(breakdown(9000, 100000, 1000).commissionCents).toBe(
      breakdown(9000, 0, 1000).commissionCents,
    );
  });
});

describe('materialsTotal (igual que private.items_total)', () => {
  it('suma cantidad × precio', () => {
    expect(
      materialsTotal([
        { name: 'Llave Vainsa', qty: 2, unit_cents: 1590 },
        { name: 'Cinta teflón', qty: 1, unit_cents: 350 },
      ]),
    ).toBe(3530);
    expect(materialsTotal([])).toBe(0);
  });
  it('rechaza cantidades o precios inválidos', () => {
    expect(() => materialsTotal([{ name: 'x', qty: 0, unit_cents: 100 }])).toThrow(RangeError);
    expect(() => materialsTotal([{ name: 'x', qty: 1, unit_cents: 1.5 }])).toThrow(TypeError);
  });
});

describe('tarifas por hora/día y tarifario', () => {
  const card = {
    unit: 'hour' as const,
    min_cents: 1000,
    suggested_cents: 1200,
    max_cents: 1800,
    visit_fee_cents: null,
  };
  it('etiqueta por unidad', () => {
    expect(unitPriceLabel(4800, 'hour', 4)).toBe('S/ 12.00 por hora × 4 horas');
    expect(unitPriceLabel(8000, 'job', 1)).toBe('S/ 80.00');
    expect(unitPriceLabel(8000, 'day', 1)).toBe('S/ 80.00 por día');
  });
  it('sugerencias × unidades', () =>
    expect(rateCardSuggestions(card, 4)).toEqual([4000, 4800, 7200]));
  it('rango del tarifario (igual que el servidor)', () => {
    expect(isWithinRateCard(5600, card, 4)).toBe(true);
    expect(isWithinRateCard(9000, card, 4)).toBe(false);
    expect(isWithinRateCard(3000, card, 4)).toBe(false);
    expect(isWithinRateCard(1, null, 1)).toBe(true);
  });
});

describe('monedas', () => {
  it('PEN por defecto y otras con su símbolo', () => {
    expect(formatMoney(4550)).toBe('S/ 45.50');
    expect(formatMoney(4550, 'USD')).toBe('US$ 45.50');
    expect(formatMoney(-100, 'EUR')).toBe('-€ 1.00');
    expect(formatMoney(100, 'XYZ')).toBe('XYZ 1.00');
  });
});

describe('estado price_renegotiated', () => {
  it('cuenta como "en el domicilio": ubicación activa y mismo paso', () => {
    expect(isTrackingStatus('price_renegotiated')).toBe(true);
    expect(trackingIntervalMs('price_renegotiated', 0, 1)).toBe(45000);
    expect(serviceStepIndex('price_renegotiated')).toBe(serviceStepIndex('at_home'));
  });
});

describe('plurales de oficios nuevos', () => {
  it.each([
    ['Chofer', 'choferes'],
    ['Albañil', 'albañiles'],
    ['Cuidador', 'cuidadores'],
    ['Limpieza', 'personas de limpieza'],
  ])('%s → %s', (n, e) => expect(tradePlural(n)).toBe(e));
});
