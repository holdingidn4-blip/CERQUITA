import { describe, expect, it } from 'vitest';
import { debtMessage, debtState, formatEntryAmount, graceDaysLeft } from './ledger';

const base = {
  pendingCents: 950,
  limitCents: 3000,
  graceDays: 3,
  overLimitSince: null,
  paused: false,
};
const now = new Date('2026-11-10T12:00:00Z');

describe('estado de la deuda', () => {
  it('bajo el límite', () => {
    expect(debtState(base)).toBe('ok');
    expect(debtMessage(base)).toBe('Estás dentro del límite de S/ 30.00. Puedes seguir cotizando.');
  });
  it('sobre el límite con días de gracia', () => {
    const d = { ...base, pendingCents: 3400, overLimitSince: '2026-11-09T12:00:00Z' };
    expect(debtState(d)).toBe('grace');
    expect(graceDaysLeft(d, now)).toBe(2);
    expect(debtMessage(d, now)).toContain('Tienes 2 días para pagar');
  });
  it('en pausa (pantalla 16)', () => {
    const d = { ...base, pendingCents: 3400, overLimitSince: '2026-11-01T00:00:00Z', paused: true };
    expect(debtState(d)).toBe('paused');
    expect(debtMessage(d)).toBe(
      'Tu comisión pendiente es S/ 34.00 y pasó el límite de S/ 30.00 hace más de 3 días. Paga para volver a cotizar.',
    );
  });
});

describe('formatEntryAmount', () => {
  it('muestra el signo', () => {
    expect(formatEntryAmount(-950)).toBe('−S/ 9.50');
    expect(formatEntryAmount(1000)).toBe('+S/ 10.00');
  });
});
