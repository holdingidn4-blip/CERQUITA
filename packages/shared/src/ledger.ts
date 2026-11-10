import type { PaymentMethod, PaymentProofStatus, WalletEntryType } from './domain';
import { formatSoles, type Cents } from './money';

export const WALLET_ENTRY_LABELS: Record<WalletEntryType, string> = {
  commission_debit: 'Comisión de servicio',
  payment_credit: 'Pago de comisión',
  promo_credit: 'Promoción de lanzamiento',
  adjustment: 'Ajuste',
  reversal: 'Corrección',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  yape: 'Yape',
  plin: 'Plin',
  transfer: 'Transferencia',
};
export const PROOF_STATUS_LABELS: Record<PaymentProofStatus, string> = {
  pending: 'En revisión',
  approved: 'Aprobada',
  rejected: 'Rechazada',
};

/** Medio con el que el cliente le pagó al pro (pantalla 6). Cerquita no recibe ese pago. */
export const CLIENT_PAYMENT_METHODS = ['cash', 'yape', 'plin'] as const;
export type ClientPaymentMethod = (typeof CLIENT_PAYMENT_METHODS)[number];
export const CLIENT_PAYMENT_LABELS: Record<ClientPaymentMethod, string> = {
  cash: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
};

export const RATING_TAGS = ['Puntual', 'Trabajo limpio', 'Buen trato', 'Buen precio'] as const;

/** "−S/ 9.50" / "+S/ 10.00" para la lista de movimientos. */
export function formatEntryAmount(cents: Cents): string {
  return `${cents < 0 ? '−' : '+'}${formatSoles(Math.abs(cents))}`;
}

export type DebtState = 'ok' | 'grace' | 'paused';
export type DebtInput = {
  pendingCents: Cents;
  limitCents: Cents;
  graceDays: number;
  overLimitSince: string | null;
  paused: boolean;
};

export function debtState(d: DebtInput): DebtState {
  if (d.paused) return 'paused';
  return d.pendingCents > d.limitCents ? 'grace' : 'ok';
}

/** Días que quedan de gracia (redondeo hacia arriba), o null si no está sobre el límite. */
export function graceDaysLeft(d: DebtInput, now: Date = new Date()): number | null {
  if (!d.overLimitSince || debtState(d) !== 'grace') return null;
  const end = new Date(d.overLimitSince).getTime() + d.graceDays * 86_400_000;
  return Math.max(0, Math.ceil((end - now.getTime()) / 86_400_000));
}

/** Texto principal de la pantalla 14/16. */
export function debtMessage(d: DebtInput, now: Date = new Date()): string {
  const state = debtState(d);
  if (state === 'paused') {
    return `Tu comisión pendiente es ${formatSoles(d.pendingCents)} y pasó el límite de ${formatSoles(d.limitCents)} hace más de ${d.graceDays} días. Paga para volver a cotizar.`;
  }
  if (state === 'grace') {
    const left = graceDaysLeft(d, now) ?? 0;
    return `Pasaste el límite de ${formatSoles(d.limitCents)}. Tienes ${left} ${left === 1 ? 'día' : 'días'} para pagar antes de que tus ofertas se pausen.`;
  }
  return `Estás dentro del límite de ${formatSoles(d.limitCents)}. Puedes seguir cotizando.`;
}
