import { formatSoles, PAYMENT_METHOD_LABELS, timeAgo } from '@cerquita/shared';
import type { Metadata } from 'next';

import { createClient } from '@/lib/supabase/server';

import styles from '../panel.module.css';
import { ProofForm } from './proof-form';

export const metadata: Metadata = { title: 'Constancias · Cerquita Panel' };

const DONE: Record<string, string> = {
  aprobada: 'Aprobada: se creó el abono en el libro.',
  rechazada: 'Constancia rechazada.',
};

export default async function Constancias({ searchParams }: PageProps<'/constancias'>) {
  const { hecho } = await searchParams;
  const supabase = await createClient();
  const { data: proofs } = await supabase
    .from('payment_proofs')
    .select(
      'id, professional_id, method, operation_code, amount_cents, created_at, pro:profiles!payment_proofs_professional_id_fkey(full_name)',
    )
    .eq('status', 'pending')
    .order('created_at');
  const debts = await Promise.all(
    (proofs ?? []).map(async (p) => {
      const { data } = await supabase.rpc('pro_debt', { p_pro: p.professional_id });
      return data?.[0] ?? null;
    }),
  );
  return (
    <>
      <h1 className={styles.h1}>Constancias de comisión por aprobar</h1>
      {typeof hecho === 'string' && DONE[hecho] && (
        <p role="status" className={styles.notice}>
          {DONE[hecho]}
        </p>
      )}
      {(proofs ?? []).length === 0 ? (
        <p className={styles.muted}>No hay constancias pendientes.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Profesional</th>
              <th>Medio</th>
              <th>Código de operación</th>
              <th>Monto</th>
              <th>Pendiente antes</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {(proofs ?? []).map((p, i) => (
              <tr key={p.id}>
                <td>
                  {p.pro?.full_name ?? 'Sin nombre'}
                  <div className={styles.muted}>{timeAgo(p.created_at)}</div>
                </td>
                <td>{PAYMENT_METHOD_LABELS[p.method]}</td>
                <td>
                  <a href={`/constancias/${p.id}/imagen`} target="_blank" rel="noopener noreferrer">
                    {p.operation_code}
                  </a>
                </td>
                <td>{formatSoles(p.amount_cents)}</td>
                <td>
                  {formatSoles(debts[i]?.pending_cents ?? 0)}
                  {debts[i]?.paused ? ' · en pausa' : ''}
                </td>
                <td>
                  <ProofForm id={p.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className={styles.footnote}>
        Aprobar crea un asiento payment_credit en el libro; nunca se edita ni se borra un asiento,
        los errores se corrigen con reversal.
      </p>
    </>
  );
}
