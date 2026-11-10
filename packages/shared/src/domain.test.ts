import { describe, expect, it } from 'vitest';
import { Constants } from './database.types';
import * as d from './domain';

// Si cambia un enum en una migración, regenera los tipos (pnpm db:types) y alinea domain.ts.
describe('domain.ts coincide con los enums de la base de datos', () => {
  const e = Constants.public.Enums;
  it.each([
    ['user_role', d.ROLES, e.user_role],
    ['job_status', d.JOB_STATUSES, e.job_status],
    ['pro_trade_status', d.PRO_TRADE_STATUSES, e.pro_trade_status],
    ['offer_status', d.OFFER_STATUSES, e.offer_status],
    ['wallet_entry_type', d.WALLET_ENTRY_TYPES, e.wallet_entry_type],
    ['payment_method', d.PAYMENT_METHODS, e.payment_method],
    ['payment_proof_status', d.PAYMENT_PROOF_STATUSES, e.payment_proof_status],
    ['sos_status', d.SOS_STATUSES, e.sos_status],
    ['verification_document_kind', d.VERIFICATION_DOCUMENT_KINDS, e.verification_document_kind],
    ['trade_category', d.TRADE_CATEGORIES, e.trade_category],
    ['pricing_unit', d.PRICING_UNITS, e.pricing_unit],
    ['materials_provider', d.MATERIALS_PROVIDERS, e.materials_provider],
    ['bypass_status', d.BYPASS_STATUSES, e.bypass_status],
  ])('%s', (_name, local, db) => {
    expect([...local]).toEqual([...db]);
  });
});
