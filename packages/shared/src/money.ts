/**
 * Dinero siempre en céntimos de sol, como entero (regla 1 de CLAUDE.md).
 * El cálculo de la comisión vive en el servidor (fase 7); aquí solo hay
 * validación y formato para mostrar.
 */

export type Cents = number;

export function assertCents(value: number): asserts value is Cents {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`El monto debe ser un entero en céntimos, se recibió ${value}`);
  }
}

/** 4550 → "S/ 45.50" */
export function formatSoles(cents: Cents): string {
  assertCents(cents);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const soles = Math.floor(abs / 100).toLocaleString('en-US');
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}S/ ${soles}.${rest}`;
}

/**
 * Convierte lo que escribe el usuario ("45", "45.5", "45,50", "S/ 1,200.00") a céntimos.
 * Devuelve null si el texto no es un monto válido. No usa aritmética de punto flotante.
 */
export function parseSolesToCents(input: string): Cents | null {
  const cleaned = input.replace(/s\/\s*/i, '').replace(/\s/g, '');
  // Coma o punto como separador decimal; coma como separador de miles solo si hay punto decimal.
  const normalized = /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(cleaned)
    ? cleaned.replace(/,/g, '')
    : cleaned.replace(',', '.');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const [, whole = '0', fraction = ''] = match;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Como formatSoles pero sin ".00" en montos enteros: 8000 → "S/ 80", 8550 → "S/ 85.50". */
export function formatSolesShort(cents: Cents): string {
  return formatSoles(cents).replace(/\.00$/, '');
}
