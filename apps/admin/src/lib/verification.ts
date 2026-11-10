import 'server-only';

import {
  IDENTITY_KINDS,
  type ProTradeStatus,
  type VerificationDocumentKind,
} from '@cerquita/shared';

import { createClient } from '@/lib/supabase/server';

export type QueueItem = {
  id: string;
  status: ProTradeStatus;
  updatedAt: string;
  proName: string;
  tradeName: string;
  evidence: VerificationDocumentKind[];
  resent: boolean;
};

const QUEUE_STATUSES: ProTradeStatus[] = ['submitted', 'in_review'];

export async function getQueue(): Promise<QueueItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('pro_trades')
    .select(
      'id, status, updated_at, reason, trade:trades(pro_name), pro:profiles!pro_trades_pro_id_fkey(full_name), verification_documents(kind)',
    )
    .in('status', QUEUE_STATUSES)
    .order('updated_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    updatedAt: row.updated_at,
    proName: row.pro?.full_name ?? 'Sin nombre',
    tradeName: row.trade?.pro_name ?? '',
    evidence: row.verification_documents.map((d) => d.kind),
    resent: row.reason !== null,
  }));
}

export type CaseDocument = { id: string; kind: VerificationDocumentKind; createdAt: string };

export async function getCase(id: string) {
  const supabase = await createClient();
  const { data: trade, error } = await supabase
    .from('pro_trades')
    .select('id, pro_id, status, reason, updated_at, good_ratings_count, trade:trades(pro_name)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!trade) return null;

  const [profile, docs, others, missing, settings] = await Promise.all([
    supabase.from('profiles').select('full_name, phone').eq('id', trade.pro_id).maybeSingle(),
    supabase
      .from('verification_documents')
      .select('id, kind, pro_trade_id, created_at')
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
  ]);

  const toDoc = (d: { id: string; kind: VerificationDocumentKind; created_at: string }) => ({
    id: d.id,
    kind: d.kind,
    createdAt: d.created_at,
  });
  const allDocs = docs.data ?? [];
  return {
    id: trade.id,
    status: trade.status,
    reason: trade.reason,
    updatedAt: trade.updated_at,
    tradeName: trade.trade?.pro_name ?? '',
    proName: profile.data?.full_name ?? 'Sin nombre',
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
