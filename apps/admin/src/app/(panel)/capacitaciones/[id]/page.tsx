import { formatLimaDateTime, TRAINING_QR_PREFIX } from '@cerquita/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import QRCode from 'qrcode';

import { createClient } from '@/lib/supabase/server';

import { ActionForm } from '../../_components/action-form';
import styles from '../../panel.module.css';
import { cancelTraining, generateCodes } from '../actions';

export const metadata: Metadata = { title: 'Capacitación · Cerquita Panel' };

/** Detalle: códigos de un solo uso con su QR (para imprimir), asistencia y certificados. */
export default async function Capacitacion({ params }: PageProps<'/capacitaciones/[id]'>) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: t }, { data: codes }, { data: attendance }] = await Promise.all([
    supabase
      .from('trainings')
      .select('id, title, description, city_slug, starts_at, place, points, pass_pct, cancelled_at')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('training_codes')
      .select('id, code, used_at')
      .eq('training_id', id)
      .order('created_at'),
    supabase
      .from('training_attendance')
      .select(
        'attended_at, quiz_attempts, quiz_score, passed_at, certificate_no, pro:profiles!training_attendance_pro_id_fkey(id, full_name)',
      )
      .eq('training_id', id)
      .order('attended_at'),
  ]);
  if (!t) return <p className={styles.muted}>Capacitación no encontrada.</p>;
  const unused = (codes ?? []).filter((c) => !c.used_at);
  const qrs = await Promise.all(
    unused.map(async (c) => ({
      ...c,
      svg: await QRCode.toString(`${TRAINING_QR_PREFIX}${c.code}`, { type: 'svg', margin: 1 }),
    })),
  );
  return (
    <>
      <p>
        <Link href="/capacitaciones">‹ Capacitaciones</Link>
      </p>
      <h1 className={styles.h1}>{t.title}</h1>
      <p className={styles.muted}>
        {formatLimaDateTime(t.starts_at)} · {t.place} · {t.city_slug} · {t.points} puntos · aprueba
        con {t.pass_pct} %
      </p>
      {t.cancelled_at ? (
        <p className={styles.badge} data-tone="danger">
          Cancelada
        </p>
      ) : (
        <section className={styles.section}>
          <h2>Códigos de asistencia</h2>
          <p className={styles.muted}>
            Entrega uno por persona al final de la charla. Cada código o QR sirve una sola vez y
            solo el día de la charla.
          </p>
          <ActionForm
            action={generateCodes.bind(null, t.id)}
            placeholder=""
            fields={[{ name: 'count', placeholder: 'Cantidad (1 a 200)', defaultValue: '10' }]}
            buttons={[{ label: 'Generar códigos', tone: 'primary' }]}
          />
          <div className={styles.qrGrid} data-testid="codigos">
            {qrs.map((c) => (
              <div key={c.id} className={styles.qrCard}>
                <div dangerouslySetInnerHTML={{ __html: c.svg }} />
                <div className={styles.code}>{c.code}</div>
              </div>
            ))}
          </div>
          <form action={cancelTraining.bind(null, t.id)}>
            <button className={styles.danger}>Cancelar capacitación</button>
          </form>
        </section>
      )}
      <section className={styles.section}>
        <h2>Asistencia ({(attendance ?? []).length})</h2>
        <table className={styles.table} data-testid="asistencia">
          <thead>
            <tr>
              <th>Profesional</th>
              <th>Asistió</th>
              <th>Cuestionario</th>
              <th>Certificado</th>
            </tr>
          </thead>
          <tbody>
            {(attendance ?? []).map((a) => (
              <tr key={a.certificate_no ?? a.attended_at}>
                <td>
                  <Link href={`/usuarios/${a.pro?.id}`}>{a.pro?.full_name ?? 'Sin nombre'}</Link>
                </td>
                <td>{formatLimaDateTime(a.attended_at)}</td>
                <td>
                  {a.quiz_score === null
                    ? 'Sin responder'
                    : `${a.quiz_score} % (${a.quiz_attempts} intento${a.quiz_attempts === 1 ? '' : 's'})`}
                </td>
                <td>{a.certificate_no ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
