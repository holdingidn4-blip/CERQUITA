import 'server-only';

import {
  IDENTITY_KINDS,
  type BackgroundResult,
  type ProTradeStatus,
  type RiskLevel,
  type VerificationDocumentKind,
} from '@cerquita/shared';

import { createClient } from '@/lib/supabase/server';

export type QueueItem = {
  id: string;
  status: ProTradeStatus;
  submittedAt: string;
  proName: string;
  tradeName: string;
  risk: RiskLevel;
  waitingHours: number;
  overdue: boolean;
  missing: string[];
  resent: boolean;
};

/** Cola ordenada en el servidor: riesgo alto primero, luego lo más antiguo (`verification_queue`). */
export async function getQueue(): Promise<QueueItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('verification_queue');
  if (error) throw error;
  const ids = (data ?? []).map((r) => r.pro_trade_id);
  const { data: reasons } = ids.length
    ? await supabase.from('pro_trades').select('id, reason').in('id', ids)
    : { data: [] };
  return (data ?? []).map((row) => ({
    id: row.pro_trade_id,
    status: row.status,
    submittedAt: row.submitted_at,
    proName: row.pro_name ?? 'Sin nombre',
    tradeName: row.trade_name,
    risk: row.risk_level as RiskLevel,
    waitingHours: Number(row.waiting_hours),
    overdue: row.overdue,
    missing: row.missing ?? [],
    resent: (reasons ?? []).some((r) => r.id === row.pro_trade_id && r.reason !== null),
  }));
}

export type CaseDocument = {
  id: string;
  kind: VerificationDocumentKind;
  createdAt: string;
  description: string | null;
  durationSeconds: number | null;
};

export async function getCase(id: string) {
  const supabase = await createClient();
  const { data: trade, error } = await supabase
    .from('pro_trades')
    .select(
      'id, pro_id, status, reason, updated_at, submitted_at, good_ratings_count, trade:trades(pro_name, risk_level)',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!trade) return null;

  const [profile, docs, others, missing, settings, identity, specialties, background, events] =
    await Promise.all([
      supabase.from('profiles').select('full_name, phone').eq('id', trade.pro_id).maybeSingle(),
      supabase
        .from('verification_documents')
        .select('id, kind, pro_trade_id, created_at, description, duration_seconds')
        .eq('pro_id', trade.pro_id)
        .order('created_at'),
      supabase
        .from('pro_trades')
        .select('id, status, good_ratings_count, trade:trades(pro_name)')
        .eq('pro_id', trade.pro_id)
        .neq('id', id),
      supabase.rpc('pro_trade_missing', { p_pro_trade: id }),
      supabase
        .from('settings')
        .select('key, value')
        .eq('scope', 'global')
        .eq('key', 'full_approval_ratings'),
      supabase
        .from('pro_identity')
        .select('dni_number, birth_date')
        .eq('pro_id', trade.pro_id)
        .maybeSingle(),
      supabase
        .from('pro_trade_specialties')
        .select('specialty:trade_specialties(name)')
        .eq('pro_trade_id', id),
      supabase
        .from('pro_background_checks')
        .select('result, reviewed_at')
        .eq('pro_trade_id', id)
        .maybeSingle(),
      supabase
        .from('pro_trade_events')
        .select(
          'id, from_status, to_status, reason, created_at, actor:profiles!pro_trade_events_actor_id_fkey(full_name)',
        )
        .eq('pro_trade_id', id)
        .order('created_at'),
    ]);

  const toDoc = (d: {
    id: string;
    kind: VerificationDocumentKind;
    created_at: string;
    description: string | null;
    duration_seconds: number | null;
  }): CaseDocument => ({
    id: d.id,
    kind: d.kind,
    createdAt: d.created_at,
    description: d.description,
    durationSeconds: d.duration_seconds,
  });
  const allDocs = docs.data ?? [];
  return {
    id: trade.id,
    status: trade.status,
    reason: trade.reason,
    updatedAt: trade.updated_at,
    tradeName: trade.trade?.pro_name ?? '',
    risk: (trade.trade?.risk_level ?? 'skill') as RiskLevel,
    submittedAt: trade.submitted_at,
    proName: profile.data?.full_name ?? 'Sin nombre',
    identityData: identity.data
      ? { dni: identity.data.dni_number, birthDate: identity.data.birth_date }
      : null,
    specialties: (specialties.data ?? []).map((s) => s.specialty?.name ?? '').filter(Boolean),
    background: background.data
      ? {
          result: background.data.result as BackgroundResult,
          reviewedAt: background.data.reviewed_at,
        }
      : null,
    events: (events.data ?? []).map((e) => ({
      id: e.id,
      from: e.from_status,
      to: e.to_status,
      reason: e.reason,
      at: e.created_at,
      actor: e.actor?.full_name ?? null,
    })),
    proPhone: profile.data?.phone ?? null,
    identity: IDENTITY_KINDS.map((kind) => ({
      kind,
      doc:
        allDocs
          .filter((d) => d.kind === kind && d.pro_trade_id === null)
          .map(toDoc)
          .at(-1) ?? null,
    })),
    evidence: allDocs.filter((d) => d.pro_trade_id === id).map(toDoc),
    otherTrades: (others.data ?? []).map((t) => ({
      id: t.id,
      status: t.status,
      goodRatings: t.good_ratings_count,
      tradeName: t.trade?.pro_name ?? '',
    })),
    missing: missing.data ?? [],
    ratingsForFull: Number(settings.data?.[0]?.value ?? 3),
  };
}
