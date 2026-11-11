import {
  formatEntryAmount,
  formatSchedule,
  formatSoles,
  timeAgo,
  WALLET_ENTRY_LABELS,
  type ScheduleKind,
} from '@cerquita/shared';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

import styles from '../../panel.module.css';

export default async function Pedido({ params }: PageProps<'/pedidos/[id]'>) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: j }, { data: offers }, { data: entries }, { data: claims }] = await Promise.all([
    supabase
      .from('jobs')
      .select(
        'id, description, status, client_id, offered_price_cents, final_price_cents, labor_cents, materials_cents, commission_rate_bps, cancel_reason, visit_fee_cents, schedule_kind, scheduled_for, created_at, trade:trades(name)',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('offers')
      .select(
        'id, pro_id, price_cents, status, created_at, pro:profiles!offers_pro_id_fkey(full_name)',
      )
      .eq('job_id', id),
    supabase
      .from('wallet_entries')
      .select('id, type, amount_cents, professional_id, created_at')
      .eq('job_id', id),
    supabase.from('claims').select('id, status, description').eq('job_id', id),
  ]);
  if (!j) notFound();
  return (
    <>
      <Link href="/buscar" className={styles.back}>
        ← Buscar
      </Link>
      <h1 className={styles.h1}>
        {j.trade?.name} · {j.description}
      </h1>
      <p className={styles.muted}>
        Estado {j.status} · {formatSchedule(j.scheduled_for, j.schedule_kind as ScheduleKind)} ·
        creado {timeAgo(j.created_at)} · <Link href={`/usuarios/${j.client_id}`}>ver cliente</Link>
      </p>
      <section className={styles.section}>
        <h2>Montos</h2>
        <p>
          Ofrecido {formatSoles(j.offered_price_cents)} · Final{' '}
          {j.final_price_cents ? formatSoles(j.final_price_cents) : '—'} · Mano de obra{' '}
          {j.labor_cents ? formatSoles(j.labor_cents) : '—'} · Materiales{' '}
          {formatSoles(j.materials_cents)} · Tasa {(j.commission_rate_bps ?? 0) / 100} %
        </p>
        {j.cancel_reason && (
          <p className={styles.muted}>
            Cancelado: {j.cancel_reason}
            {j.visit_fee_cents ? ` · visita ${formatSoles(j.visit_fee_cents)}` : ''}
          </p>
        )}
      </section>
      <section className={styles.section}>
        <h2>Ofertas</h2>
        <ul>
          {(offers ?? []).map((o) => (
            <li key={o.id}>
              <Link href={`/usuarios/${o.pro_id}`}>{o.pro?.full_name ?? 'Profesional'}</Link> ·{' '}
              {formatSoles(o.price_cents)} · {o.status}
            </li>
          ))}
        </ul>
      </section>
      <section className={styles.section}>
        <h2>Asientos del libro</h2>
        <ul>
          {(entries ?? []).map((e) => (
            <li key={e.id}>
              {WALLET_ENTRY_LABELS[e.type]} {formatEntryAmount(e.amount_cents)} ·{' '}
              <Link href={`/usuarios/${e.professional_id}`}>profesional</Link>
            </li>
          ))}
        </ul>
        <p className={styles.muted}>
          Para revertir un asiento, ábrelo desde la ficha del profesional.
        </p>
      </section>
      {(claims ?? []).length > 0 && (
        <section className={styles.section}>
          <h2>Disputas</h2>
          {(claims ?? []).map((c) => (
            <p key={c.id}>
              {c.status}: {c.description} — <Link href="/reclamos">gestionar</Link>
            </p>
          ))}
        </section>
      )}
    </>
  );
}
