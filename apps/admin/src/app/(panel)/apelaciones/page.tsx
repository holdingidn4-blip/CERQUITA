import { timeAgo } from '@cerquita/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/server';

import { ActionForm } from '../_components/action-form';
import { reviewNoShowAppeal } from '../_components/actions';
import styles from '../panel.module.css';

export const metadata: Metadata = { title: 'Apelaciones · Cerquita Panel' };

/** Apelaciones de llegadas incumplidas: si se acepta, la falta deja de contar para la pausa. */
export default async function Apelaciones() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('pro_no_shows')
    .select(
      'id, reported_at, promised_arrival_at, appeal_text, appealed_at, appeal_status, appeal_note, pro:profiles!pro_no_shows_pro_id_fkey(id, full_name)',
    )
    .not('appeal_status', 'is', null)
    .order('appealed_at', { ascending: false })
    .limit(50);
  const rows = data ?? [];
  const pending = rows.filter((r) => r.appeal_status === 'pending');
  return (
    <>
      <h1 className={styles.h1}>Apelaciones de llegadas incumplidas</h1>
      <p className={styles.muted}>
        Si aceptas, la falta deja de contar para la pausa del profesional. El cupón del cliente se
        mantiene (lo asume Cerquita).
      </p>
      {rows.length === 0 ? (
        <p className={styles.muted}>No hay apelaciones.</p>
      ) : (
        <table className={styles.table} data-testid="apelaciones">
          <thead>
            <tr>
              <th>Profesional</th>
              <th>Falta</th>
              <th>Lo que cuenta</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {[...pending, ...rows.filter((r) => r.appeal_status !== 'pending')].map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/usuarios/${r.pro?.id}`}>{r.pro?.full_name ?? 'Sin nombre'}</Link>
                </td>
                <td>{timeAgo(r.reported_at)}</td>
                <td>“{r.appeal_text}”</td>
                <td>
                  {r.appeal_status === 'pending' ? (
                    <ActionForm
                      action={reviewNoShowAppeal.bind(null, r.id)}
                      buttons={[
                        { name: 'decision', value: 'accept', label: 'Aceptar', tone: 'primary' },
                        { name: 'decision', value: 'reject', label: 'Rechazar', tone: 'danger' },
                      ]}
                      placeholder="Motivo de la decisión"
                    />
                  ) : (
                    <span
                      className={styles.badge}
                      data-tone={r.appeal_status === 'accepted' ? 'success' : 'danger'}
                    >
                      {r.appeal_status === 'accepted' ? 'Aceptada' : 'Rechazada'}
                      {r.appeal_note ? ` · ${r.appeal_note}` : ''}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
