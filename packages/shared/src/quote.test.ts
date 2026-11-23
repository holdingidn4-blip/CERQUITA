import { describe, expect, it } from 'vitest';
import { formatLimaDateTime, proReceives, quoteTotal, receiptHtml, type Receipt } from './quote';

const q = { visit: 2000, labor: 6000, materials: 1500, transport: 500 };

describe('cotización con desglose', () => {
  it('suma los cuatro rubros', () => expect(quoteTotal(q)).toBe(10000));
  it('la comisión solo se descuenta de la mano de obra', () => {
    // 10 % de S/ 60 = S/ 6 → recibe S/ 94 de S/ 100
    expect(proReceives(q, 1000)).toBe(9400);
  });
});

describe('formatLimaDateTime', () => {
  it('usa la hora de Lima (UTC−5)', () => {
    expect(formatLimaDateTime('2026-11-23T03:05:00Z')).toBe('22/11/2026 22:05');
  });
});

describe('receiptHtml', () => {
  const r: Receipt = {
    code: 'AB12CD34',
    trade: 'Gasfitería',
    description: 'Cambiar caño <cocina>',
    confirmed_at: '2026-11-23T15:00:00Z',
    pro_name: 'Carlos M.',
    client_name: 'Rosa V.',
    visit_cents: 2000,
    labor_cents: 6000,
    materials_cents: 0,
    transport_cents: 500,
    points_discount_cents: 0,
    coupon_discount_cents: 1000,
    total_cents: 8500,
    to_pay_cents: 7500,
    acceptance: { version: 2, accepted_at: '2026-11-23T14:00:00Z', terms_version: '2026-11-23' },
  };
  const html = receiptHtml(r);
  it('trae el desglose, el cupón y lo pagado', () => {
    expect(html).toContain('Mano de obra');
    expect(html).toContain('S/ 85.00');
    expect(html).toContain('− S/ 10.00');
    expect(html).toContain('S/ 75.00');
    expect(html).not.toContain('Materiales');
  });
  it('dice la versión aceptada y que no es comprobante SUNAT', () => {
    expect(html).toContain('versión 2');
    expect(html).toContain('no es un comprobante de pago SUNAT');
  });
  it('escapa el texto del cliente', () => {
    expect(html).toContain('&lt;cocina&gt;');
  });
});
