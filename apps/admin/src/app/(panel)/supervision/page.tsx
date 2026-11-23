import { timeAgo } from '@cerquita/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/server';

import { reviewSupervision } from '../_components/actions';
import styles from '../panel.module.css';
import { ChecklistForm } from './checklist-form';

export const metadata: Metadata = { title: 'Supervisión · Cerquita Panel' };

const REASON = { first_job: 'Primer trabajo', risk_sample: 'Muestra (oficio de riesgo)' } as const;
const STATUS = { ok: 'Todo bien', issues: 'Con problemas', cancelled: 'Cancelada' } as const;
const DONE = ['finished', 'confirmed', 'rated'];

/** Primer trabajo supervisado y muestreo en oficios de riesgo: llegada, trato, alcance y seguridad. */
export default async function Supervision() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('job_supervisions')
    .select(
      'id, reason, status, note, created_at, reviewed_at, arrival_ok, treatment_ok, scope_ok, safety_ok, job:jobs!job_supervisions_job_id_fkey(id, status, description), pro:profiles!job_supervisions_pro_id_fkey(id, full_name)',
    )
    .order('created_at', { ascending: false })
    .limit(60);
  const rows = data ?? [];
  const pending = rows.filter((r) => r.status === 'pending');
  const done = rows.filter((r) => r.status !== 'pending');
  return (
    <>
      <h1 className={styles.h1}>Supervisión</h1>
      <p className={styles.muted}>
        El primer trabajo de cada profesional y una muestra de los oficios de riesgo se revisan
        llamando al cliente cuando el trabajo termina. Si algo falló, describe qué pasó.
      </p>
      <h2 className={styles.h2}>Pendientes ({pending.length})</h2>
      {pending.length === 0 ? (
        <p className={styles.muted}>No hay supervisiones pendientes.</p>
      ) : (
        <table className={styles.table} data-testid="supervision-pendiente">
          <thead>
            <tr>
              <th>Profesional</th>
              <th>Trabajo</th>
              <th>Motivo</th>
              <th>Checklist</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/usuarios/${r.pro?.id}`}>{r.pro?.full_name ?? 'Sin nombre'}</Link>
                </td>
                <td>
                  <Link href={`/pedidos/${r.job?.id}`}>{r.job?.description?.slice(0, 40)}</Link>
                  <div className={styles.muted}>{timeAgo(r.created_at)}</div>
                </td>
                <td>{REASON[r.reason as keyof typeof REASON]}</td>
                <td>
                  {DONE.includes(r.job?.status ?? '') ? (
                    <ChecklistForm action={reviewSupervision.bind(null, r.id)} />
                  ) : (
                    <span className={styles.muted}>Se revisa cuando el trabajo termine.</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2 className={styles.h2}>Revisadas</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Profesional</th>
            <th>Motivo</th>
            <th>Resultado</th>
            <th>Nota</th>
          </tr>
        </thead>
        <tbody>
          {done.map((r) => (
            <tr key={r.id}>
              <td>{r.pro?.full_name ?? 'Sin nombre'}</td>
              <td>{REASON[r.reason as keyof typeof REASON]}</td>
              <td>
                <span
                  className={styles.badge}
                  data-tone={
                    r.status === 'ok' ? 'success' : r.status === 'issues' ? 'danger' : undefined
                  }
                >
                  {STATUS[r.status as keyof typeof STATUS]}
                </span>
              </td>
              <td>{r.note ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
