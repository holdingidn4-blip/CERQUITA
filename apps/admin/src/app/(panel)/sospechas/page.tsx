import { timeAgo } from '@cerquita/shared';
import type { Metadata } from 'next';

import { createClient } from '@/lib/supabase/server';

import styles from '../panel.module.css';
import { ReviewForm } from './review-form';

export const metadata: Metadata = { title: 'Sospechas de bypass · Cerquita Panel' };

const STATUS = { open: 'Abierta', dismissed: 'Descartada', confirmed: 'Confirmada' } as const;

export default async function Sospechas({ searchParams }: PageProps<'/sospechas'>) {
  const { hecho } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc('bypass_queue');
  return (
    <>
      <h1 className={styles.h1}>Sospechas de bypass</h1>
      {typeof hecho === 'string' && (
        <p role="status" className={styles.notice}>
          Sospecha {hecho}.
        </p>
      )}
      <p className={styles.muted}>
        Pedido cancelado y el profesional sigue más de 15 minutos en la ubicación del cliente (GPS
        en línea, sin historial). Con 2 sospechas en 7 días sus oficios se suspenden solos; si
        descartas y queda bajo el límite, vuelven a observación.
      </p>
      {(data ?? []).length === 0 ? (
        <p className={styles.muted}>No hay sospechas.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Profesional</th>
              <th>Pedido cancelado</th>
              <th>En el lugar</th>
              <th>Semana</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((s) => (
              <tr key={s.id} data-testid="sospecha">
                <td>
                  {s.pro_name ?? 'Sin nombre'}
                  {s.pro_suspended && <div className={styles.errorInline}>Suspendido</div>}
                </td>
                <td>
                  {s.job_description}
                  <div className={styles.muted}>{timeAgo(s.detected_at)}</div>
                </td>
                <td>
                  {s.minutes_on_site} min a {s.distance_m} m
                </td>
                <td>{s.week_count} de 2</td>
                <td>{STATUS[s.status]}</td>
                <td>{s.status === 'open' ? <ReviewForm id={s.id} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
