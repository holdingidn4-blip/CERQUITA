/**
 * Tipos y valores del dominio, tomados de docs/documento-tecnico.md.
 * Los parámetros de negocio (tasa, límite, gracia, promoción) NO van aquí:
 * se leen de la tabla `settings` (regla 9 de CLAUDE.md). Aquí solo están sus claves.
 */

export const ROLES = ['client', 'pro'] as const;
export type Role = (typeof ROLES)[number];

/** Estados del pedido (`jobs.status`). */
export const JOB_STATUSES = [
  'published', // Publicado
  'with_offers', // Con ofertas
  'accepted', // Aceptado: precio y tasa congelados
  'on_the_way', // En camino
  'at_home', // En el domicilio
  'finished', // Terminado (lo marca el profesional)
  'confirmed', // Confirmado: se crea commission_debit
  'rated', // Calificado
  'cancelled', // Cancelado
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Estados en los que el profesional comparte su ubicación con el cliente. */
export const JOB_STATUSES_WITH_TRACKING: readonly JobStatus[] = ['on_the_way', 'at_home'];

/** Verificación por oficio (`pro_trades.status`). */
export const PRO_TRADE_STATUSES = [
  'draft', // borrador
  'submitted', // enviado
  'in_review', // en revisión
  'needs_info', // falta información
  'approved_observation', // aprobado en observación
  'approved_full', // aprobado pleno
  'rejected', // rechazado
  'suspended', // suspendido
] as const;
export type ProTradeStatus = (typeof PRO_TRADE_STATUSES)[number];

export const APPROVED_PRO_TRADE_STATUSES: readonly ProTradeStatus[] = [
  'approved_observation',
  'approved_full',
];

export const OFFER_STATUSES = ['pending', 'accepted', 'rejected', 'withdrawn', 'expired'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const WALLET_ENTRY_TYPES = [
  'commission_debit',
  'payment_credit',
  'promo_credit',
  'adjustment',
  'reversal',
] as const;
export type WalletEntryType = (typeof WALLET_ENTRY_TYPES)[number];

export const PAYMENT_METHODS = ['yape', 'plin', 'transfer'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_PROOF_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type PaymentProofStatus = (typeof PAYMENT_PROOF_STATUSES)[number];

export const SOS_STATUSES = ['countdown', 'open', 'closed', 'cancelled'] as const;
export type SosStatus = (typeof SOS_STATUSES)[number];

export const VERIFICATION_DOCUMENT_KINDS = [
  'dni_front',
  'dni_back',
  'selfie',
  'background',
  'work_photo',
  'certificate',
  'reference',
  'quiz',
] as const;
export type VerificationDocumentKind = (typeof VERIFICATION_DOCUMENT_KINDS)[number];

/** Catálogo inicial de oficios (tabla `trades`). */
export const TRADE_SLUGS = [
  'gasfiteria',
  'electricidad',
  'carpinteria',
  'pintura',
  'hogar',
] as const;
export type TradeSlug = (typeof TRADE_SLUGS)[number];

/** Claves de la tabla `settings`. Los valores viven en la base de datos. */
export const SETTING_KEYS = {
  commissionRateBps: 'commission_rate_bps',
  debtLimitCents: 'debt_limit_cents',
  graceDays: 'grace_days',
  launchPromoJobs: 'launch_promo_jobs',
} as const;
export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

export const MAX_TRUSTED_CONTACTS = 3;
