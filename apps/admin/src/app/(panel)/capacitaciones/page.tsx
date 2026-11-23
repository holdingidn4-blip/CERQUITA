import { formatLimaDateTime } from '@cerquita/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/server';

import styles from '../panel.module.css';
import { TrainingForm } from './training-form';

export const metadata: Metadata = { title: 'Capacitaciones · Cerquita Panel' };

/** Charlas para profesionales por ciudad y oficio, con asistencia por código o QR. */
export default async function Capacitaciones() {
  const supabase = await createClient();
  const [{ data: trainings }, { data: trades }, { data: attendance }] = await Promise.all([
    supabase
      .from('trainings')
      .select('id, title, city_slug, starts_at, place, points, cancelled_at, trade:trades(name)')
      .order('starts_at', { ascending: false })
      .limit(50),
    supabase.from('trades').select('id, name').eq('active', true).order('id'),
    supabase.from('training_attendance').select('training_id, passed_at'),
  ]);
  const count = (id: string, passed: boolean) =>
    (attendance ?? []).filter((a) => a.training_id === id && (!passed || a.passed_at)).length;
  return (
    <>
      <h1 className={styles.h1}>Capacitaciones</h1>
      <p className={styles.muted}>
        Los profesionales registran su asistencia con un código o QR de un solo uso, responden el
        cuestionario y reciben su certificado y puntos (suben de nivel). El canje de premios está
        marcado como “próximamente”: no prometas dinero, vales ni sorteos.
      </p>
      <TrainingForm trades={trades ?? []} />
      <table className={styles.table} data-testid="capacitaciones">
        <thead>
          <tr>
            <th>Charla</th>
            <th>Fecha</th>
            <th>Oficio</th>
            <th>Asistieron</th>
            <th>Aprobaron</th>
          </tr>
        </thead>
        <tbody>
          {(trainings ?? []).map((t) => (
            <tr key={t.id}>
              <td>
                <Link href={`/capacitaciones/${t.id}`}>{t.title}</Link>
                {t.cancelled_at && (
                  <span className={styles.badge} data-tone="danger">
                    Cancelada
                  </span>
                )}
                <div className={styles.muted}>
                  {t.place} · {t.city_slug} · {t.points} pts
                </div>
              </td>
              <td>{formatLimaDateTime(t.starts_at)}</td>
              <td>{t.trade?.name ?? 'Todos'}</td>
              <td>{count(t.id, false)}</td>
              <td>{count(t.id, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
