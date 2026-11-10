import type { MaterialsProvider, PricingUnit, TradeCategory } from './domain';
import { assertCents, formatSoles, type Cents } from './money';
import { commissionCents } from './orders';

export const CATEGORY_LABELS: Record<TradeCategory, string> = {
  technical: 'Técnicos',
  construction: 'Construcción',
  domestic: 'Servicio del hogar',
  driver: 'Choferes',
};

export const PRICING_UNIT_LABELS: Record<
  PricingUnit,
  { per: string; plural: string; singular: string }
> = {
  job: { per: 'por trabajo', plural: 'trabajos', singular: 'trabajo' },
  hour: { per: 'por hora', plural: 'horas', singular: 'hora' },
  day: { per: 'por día', plural: 'días', singular: 'día' },
};

export const MATERIALS_PROVIDER_LABELS: Record<MaterialsProvider, string> = {
  client: 'Los pone el cliente',
  pro: 'Los compra el profesional (con boleta)',
};

/** Aviso antifraude que se muestra al cliente y al profesional. TODO(decidir): respaldo legal del seguro y la garantía. */
export const OFF_APP_WARNING =
  'Los pagos fuera de la app pierden el Seguro Cerquita y la Garantía por 30 días.';

/** Monedas soportadas; el piloto usa PEN. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  PEN: 'S/',
  USD: 'US$',
  EUR: '€',
  COP: 'COL$',
  CLP: 'CLP$',
  MXN: 'MX$',
};
export function formatMoney(cents: Cents, currency = 'PEN'): string {
  if (currency === 'PEN') return formatSoles(cents);
  assertCents(cents);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString('en-US');
  return `${sign}${CURRENCY_SYMBOLS[currency] ?? currency} ${whole}.${String(abs % 100).padStart(2, '0')}`;
}

/** "S/ 12.00 por hora × 4 horas" (o solo el precio si es por trabajo). */
export function unitPriceLabel(
  totalCents: Cents,
  unit: PricingUnit,
  units: number,
  currency = 'PEN',
): string {
  if (unit === 'job' || units <= 1) {
    return unit === 'job'
      ? formatMoney(totalCents, currency)
      : `${formatMoney(totalCents, currency)} ${PRICING_UNIT_LABELS[unit].per}`;
  }
  const per = Math.round(totalCents / units);
  return `${formatMoney(per, currency)} ${PRICING_UNIT_LABELS[unit].per} × ${units} ${PRICING_UNIT_LABELS[unit].plural}`;
}

export type MaterialItem = {
  name: string;
  qty: number;
  unit_cents: Cents;
  catalog_id?: string;
  store?: string;
  brand?: string;
};

/** Mismo cálculo que private.items_total() en la base. */
export function materialsTotal(items: readonly MaterialItem[]): Cents {
  return items.reduce((sum, item) => {
    if (!Number.isInteger(item.qty) || item.qty <= 0)
      throw new RangeError(`Cantidad inválida: ${item.name}`);
    assertCents(item.unit_cents);
    return sum + item.qty * item.unit_cents;
  }, 0);
}

export type Breakdown = {
  laborCents: Cents;
  materialsCents: Cents;
  totalCents: Cents;
  commissionCents: Cents;
  proReceivesCents: Cents;
};

/**
 * Desglose transparente: la comisión se calcula SOLO sobre la mano de obra; los materiales van
 * 100 % al profesional (reembolso con boleta) o no existen si los pone el cliente.
 */
export function breakdown(laborCents: Cents, materialsCents: Cents, rateBps: number): Breakdown {
  assertCents(laborCents);
  assertCents(materialsCents);
  const commission = commissionCents(laborCents, rateBps);
  return {
    laborCents,
    materialsCents,
    totalCents: laborCents + materialsCents,
    commissionCents: commission,
    proReceivesCents: laborCents - commission + materialsCents,
  };
}

export type RateCard = {
  unit: PricingUnit;
  min_cents: Cents;
  suggested_cents: Cents;
  max_cents: Cents;
  visit_fee_cents: Cents | null;
};

/** Sugerencias de cotización a partir del tarifario (mínimo, sugerido y máximo × unidades). */
export function rateCardSuggestions(card: RateCard, units: number): Cents[] {
  const n = Math.max(1, units);
  return [...new Set([card.min_cents * n, card.suggested_cents * n, card.max_cents * n])];
}

export function isWithinRateCard(priceCents: Cents, card: RateCard | null, units: number): boolean {
  if (!card) return true;
  const n = Math.max(1, units);
  return priceCents >= card.min_cents * n && priceCents <= card.max_cents * n;
}
