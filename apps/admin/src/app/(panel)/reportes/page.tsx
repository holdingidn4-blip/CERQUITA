import { REPORT_REASONS, timeAgo, type ReportReason } from '@cerquita/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/server';

import { ActionForm } from '../_components/action-form';
import { reviewReport } from '../_components/actions';
import styles from '../panel.module.css';

export const metadata: Metadata = { title: 'Reportes · Cerquita Panel' };

export default async function Reportes() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('user_reports')
    .select(
      'id, reason, details, status, created_at, reporter:profiles!user_reports_reporter_id_fkey(full_name), reported:profiles!user_reports_reported_id_fkey(id, full_name)',
    )
    .order('created_at', { ascending: false })
    .limit(100);
  return (
    <>
      <h1 className={styles.h1}>Reportes de usuarios</h1>
      <p className={styles.muted}>
        Reportes hechos desde la app (“Reportar y bloquear”). El bloqueo ya se aplicó; aquí se
        decide si hace falta una medida.
      </p>
      <table className={styles.table}>
        <tbody>
          {(data ?? []).map((r) => (
            <tr key={r.id} data-testid="reporte">
              <td>
                {r.reporter?.full_name ?? 'Usuario'} →{' '}
                <Link href={`/usuarios/${r.reported?.id}`}>
                  {r.reported?.full_name ?? 'Usuario'}
                </Link>
                <div className={styles.muted}>
                  {REPORT_REASONS[r.reason as ReportReason]} · {timeAgo(r.created_at)}
                </div>
                {r.details && <div>{r.details}</div>}
              </td>
              <td>{r.status}</td>
              <td>
                {r.status === 'open' && (
                  <ActionForm
                    action={reviewReport.bind(null, r.id)}
                    buttons={[
                      {
                        name: 'decision',
                        value: 'actioned',
                        label: 'Medida tomada',
                        tone: 'danger',
                      },
                      { name: 'decision', value: 'reviewed', label: 'Revisado' },
                      { name: 'decision', value: 'dismissed', label: 'Descartar' },
                    ]}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
