import { mapsLink, maskPhone, timeAgo } from '@cerquita/shared';
import type { Metadata } from 'next';

import { createClient } from '@/lib/supabase/server';

import styles from '../panel.module.css';
import { CloseForm } from './close-form';

export const metadata: Metadata = { title: 'Alertas SOS · Cerquita Panel' };

export default async function Sos({ searchParams }: PageProps<'/sos'>) {
  const { hecho } = await searchParams;
  const supabase = await createClient();
  const { data: alerts } = await supabase.rpc('sos_open_alerts');
  return (
    <>
      <h1 className={styles.h1}>Alertas SOS</h1>
      {hecho === 'cerrada' && (
        <p role="status" className={styles.notice}>
          Alerta cerrada con nota.
        </p>
      )}
      <p className={styles.muted}>
        Recarga la página para ver la última ubicación (se actualiza cada 10 s).
      </p>
      {(alerts ?? []).length === 0 ? (
        <p className={styles.muted}>No hay alertas abiertas.</p>
      ) : (
        <ul className={styles.queue}>
          {(alerts ?? []).map((a) => (
            <li key={a.id} className={styles.section} data-testid="alerta-sos">
              <div className={styles.caseHeader}>
                <div>
                  <h2>
                    {a.user_name ?? 'Usuario'} ·{' '}
                    {a.user_phone ? maskPhone(a.user_phone) : 'sin teléfono'}
                  </h2>
                  <p className={styles.muted}>
                    Abierta {timeAgo(a.opened_at)}
                    {a.job_description ? ` · Servicio: ${a.job_description}` : ''}
                  </p>
                </div>
                <span className={styles.badge} data-tone="danger">
                  Abierta
                </span>
              </div>
              {a.latitude !== null && a.longitude !== null ? (
                <p>
                  <a
                    href={mapsLink(a.latitude, a.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Ver ubicación en el mapa
                  </a>{' '}
                  <span className={styles.muted}>
                    ({a.last_point_at ? timeAgo(a.last_point_at) : 'sin hora'})
                  </span>
                </p>
              ) : (
                <p className={styles.muted}>Sin ubicación.</p>
              )}
              {a.user_phone && (
                <p>
                  <a href={`tel:+${a.user_phone}`}>Llamar al usuario</a>
                </p>
              )}
              <CloseForm id={a.id} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
