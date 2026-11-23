import { commissionCents } from './orders';
import { formatSoles } from './money';

/** Términos fijos de toda cotización (F3). La versión debe coincidir con `settings.quote_terms_version`. */
export const QUOTE_TERMS_VERSION = '2026-11-23';
export const QUOTE_TERMS = [
  'Cerquita es una plataforma intermediaria: conecta clientes con profesionales independientes. No presta el servicio ni cobra el trabajo: pagas directo al profesional.',
  'El precio es el de esta cotización: visita, mano de obra, materiales y movilidad. Si algo cambia en el domicilio, el profesional te envía una cotización nueva y solo vale si la aceptas.',
  'La calidad y la garantía del trabajo son responsabilidad del profesional. Si hay un problema, repórtalo desde la app.',
] as const;

export type QuoteBreakdown = {
  visit: number;
  labor: number;
  materials: number;
  transport: number;
};

export const QUOTE_LINES: { key: keyof QuoteBreakdown; label: string }[] = [
  { key: 'visit', label: 'Visita' },
  { key: 'labor', label: 'Mano de obra' },
  { key: 'materials', label: 'Materiales' },
  { key: 'transport', label: 'Movilidad' },
];

export function quoteTotal(q: QuoteBreakdown): number {
  return q.visit + q.labor + q.materials + q.transport;
}

/** Lo que recibe el pro: el total menos la comisión, que solo se calcula sobre la mano de obra. */
export function proReceives(q: QuoteBreakdown, rateBps: number): number {
  return quoteTotal(q) - commissionCents(q.labor, rateBps);
}

/** Fecha y hora de Lima (UTC−5, sin horario de verano): "23/11/2026 14:05". */
export function formatLimaDateTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 5 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export type Receipt = {
  code: string;
  trade: string;
  description: string;
  confirmed_at: string | null;
  pro_name: string | null;
  client_name: string | null;
  visit_cents: number;
  labor_cents: number;
  materials_cents: number;
  transport_cents: number;
  points_discount_cents: number;
  coupon_discount_cents: number;
  total_cents: number;
  to_pay_cents: number;
  acceptance: { version: number; accepted_at: string; terms_version: string } | null;
};

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

/** HTML del comprobante de servicio que la app convierte en PDF para compartir (WhatsApp, correo). */
export function receiptHtml(r: Receipt): string {
  const row = (label: string, cents: number, negative = false) =>
    cents > 0
      ? `<tr><td>${label}</td><td class="n">${negative ? '− ' : ''}${formatSoles(cents)}</td></tr>`
      : '';
  const date = r.confirmed_at ? formatLimaDateTime(r.confirmed_at) : '—';
  const accepted = r.acceptance
    ? `Cotización aceptada por el cliente (versión ${r.acceptance.version}) el ${formatLimaDateTime(r.acceptance.accepted_at)}. Términos versión ${escapeHtml(r.acceptance.terms_version)}.`
    : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comprobante ${escapeHtml(r.code)}</title>
<style>body{font-family:Helvetica,Arial,sans-serif;color:#17231F;padding:28px;font-size:14px}
h1{color:#0E5A4B;margin:0 0 4px}p{margin:4px 0}table{width:100%;border-collapse:collapse;margin:16px 0}
td{padding:8px 0;border-bottom:1px solid #E1DCCF}.n{text-align:right}.total td{font-weight:700;font-size:16px}
small{color:#56625C;display:block;margin-top:8px;line-height:1.4}</style></head><body>
<h1>Cerquita</h1>
<p><strong>Comprobante de servicio N.° ${escapeHtml(r.code)}</strong></p>
<p>Fecha: ${date} · Oficio: ${escapeHtml(r.trade)}</p>
<p>Profesional: ${escapeHtml(r.pro_name ?? '—')} · Cliente: ${escapeHtml(r.client_name ?? '—')}</p>
<p>${escapeHtml(r.description)}</p>
<table>
${row('Visita', r.visit_cents)}${row('Mano de obra', r.labor_cents)}${row('Materiales', r.materials_cents)}${row('Movilidad', r.transport_cents)}
<tr class="total"><td>Total del servicio</td><td class="n">${formatSoles(r.total_cents)}</td></tr>
${row('Descuento Puntos Cerquita', r.points_discount_cents, true)}${row('Cupón Cerquita', r.coupon_discount_cents, true)}
${r.to_pay_cents !== r.total_cents ? `<tr class="total"><td>Pagado al profesional</td><td class="n">${formatSoles(r.to_pay_cents)}</td></tr>` : ''}
</table>
<small>${accepted}</small>
<small>Este documento no es un comprobante de pago SUNAT. Cerquita es intermediaria: el pago se hace directo al profesional, que es responsable del trabajo.</small>
</body></html>`;
}
