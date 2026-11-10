import { assertCents, type Cents } from './money';

/**
 * Comisión en céntimos. Misma fórmula que private.commission_cents() en la base:
 * redondeo al céntimo; un empate exacto de medio céntimo favorece al profesional.
 * La tasa (bps) siempre viene de `settings` o del pedido congelado, nunca fija.
 */
export function commissionCents(priceCents: Cents, rateBps: number): Cents {
  assertCents(priceCents);
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10000)
    throw new RangeError('Tasa inválida');
  return Math.floor((priceCents * rateBps + 4999) / 10000);
}

/** Lo que recibe el profesional: precio − comisión. */
export function netCents(priceCents: Cents, rateBps: number): Cents {
  return priceCents - commissionCents(priceCents, rateBps);
}

/** "10 %" a partir de 1000 bps. */
export function formatRate(rateBps: number): string {
  const pct = rateBps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1).replace('.', ',')} %`;
}

/** 850 → "850 m"; 1250 → "1,3 km". */
export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${(Math.round(km * 10) / 10).toString().replace('.', ',')} km`;
}

/** Minutos aproximados de llegada en la ciudad (~8,4 km/h puerta a puerta). */
export const CITY_METERS_PER_MINUTE = 140;
export function etaMinutes(meters: number | null | undefined): number | null {
  if (meters === null || meters === undefined) return null;
  return Math.max(1, Math.round(meters / CITY_METERS_PER_MINUTE));
}

/** "850 m · llega en 6 min" */
export function distanceAndEta(meters: number | null | undefined, verb = 'llega en'): string {
  const eta = etaMinutes(meters);
  if (eta === null) return '';
  return `${formatDistance(meters)} · ${verb} ${eta} min`;
}

/**
 * Sugerencias para cotizar: el precio del cliente y tres montos por encima (+12,5 %, +18,75 %, +25 %),
 * redondeados a S/ 5. Con S/ 80 da 80, 90, 95 y 100, como en la pantalla 8.
 */
export function quoteSuggestions(clientPriceCents: Cents): Cents[] {
  assertCents(clientPriceCents);
  const steps = [1.125, 1.1875, 1.25].map(
    (factor) => Math.round((clientPriceCents * factor) / 500) * 500,
  );
  return [...new Set([clientPriceCents, ...steps])].filter((v) => v >= clientPriceCents);
}

export type OfferKind = 'client_price' | 'counter';
export function offerKind(offerCents: Cents, clientPriceCents: Cents): OfferKind {
  return offerCents === clientPriceCents ? 'client_price' : 'counter';
}
export const OFFER_KIND_LABEL: Record<OfferKind, string> = {
  client_price: 'Tu precio',
  counter: 'Contraoferta',
};

/** 4.86 → "4,9"; null → "Nuevo". */
export function formatRating(avg: number | string | null | undefined): string {
  if (avg === null || avg === undefined || avg === '') return 'Nuevo';
  return Number(avg).toFixed(1).replace('.', ',');
}

/** Precio mínimo y máximo que acepta un pedido (S/ 10 a S/ 5 000). */
export const MIN_JOB_PRICE_CENTS = 1000;
export const MAX_JOB_PRICE_CENTS = 500000;

/** Un punto aproximado (~110 m) como lo guarda el servidor; la app lo usa antes de enviar. */
export function approxPointWkt(latitude: number, longitude: number): string {
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180)
    throw new RangeError('Coordenadas inválidas');
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return `SRID=4326;POINT(${round(longitude)} ${round(latitude)})`;
}

/** "Gasfitero" → "gasfiteros", "Pintor" → "pintores", "Hogar" → "profesionales de hogar". */
export function tradePlural(proName: string, count = 2): string {
  const name = proName.trim().toLowerCase();
  if (name === 'hogar') return count === 1 ? 'profesional de hogar' : 'profesionales de hogar';
  if (count === 1) return name;
  return /[aeiouáéíóú]$/.test(name) ? `${name}s` : `${name}es`;
}

/** Primera oración de la descripción como título del pedido ("Fuga bajo el lavadero"). */
export function jobTitle(description: string, max = 48): string {
  const first = description.split(/[.!?\n]/)[0]?.trim() || description.trim();
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
}
