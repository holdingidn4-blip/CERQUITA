import { PRO_TRADE_STATUS_LABELS, RISK_LABELS } from '@cerquita/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { getQueue } from '@/lib/verification';

import styles from '../panel.module.css';

export const metadata: Metadata = { title: 'Verificación · Cerquita Panel' };

const DONE: Record<string, string> = {
  approve: 'Oficio aprobado: queda en observación.',
  needs_info: 'Pedimos más evidencia al profesional.',
  reject: 'Oficio rechazado.',
};

const RISK_TONE = { high: 'danger', trust: 'warning', skill: 'info' } as const;

function waiting(hours: number): string {
  if (hours < 1) return 'hace menos de 1 h';
  if (hours < 48) return `hace ${Math.floor(hours)} h`;
  return `hace ${Math.floor(hours / 24)} días`;
}

export default async function Verificacion({ searchParams }: PageProps<'/verificacion'>) {
  const { hecho } = await searchParams;
  const queue = await getQueue();
  const overdue = queue.filter((q) => q.overdue).length;
  return (
    <>
      <h1 className={styles.h1}>Cola de verificación</h1>
      <p className={styles.muted}>Primero el riesgo alto, después lo que más espera.</p>
      {typeof hecho === 'string' && DONE[hecho] && (
        <p role="status" className={styles.notice}>
          {DONE[hecho]}
        </p>
      )}
      {overdue > 0 && (
        <p role="alert" className={styles.error} data-testid="cola-vencidas">
          {overdue} {overdue === 1 ? 'oficio lleva' : 'oficios llevan'} más de 24 h esperando.
        </p>
      )}
      {queue.length === 0 ? (
        <p className={styles.muted}>No hay oficios esperando revisión.</p>
      ) : (
        <ul className={styles.queue}>
          {queue.map((item) => (
            <li key={item.id}>
              <Link href={`/verificacion/${item.id}`} className={styles.queueItem}>
                <span className={styles.queueTitle}>
                  {item.proName} · {item.tradeName}
                </span>
                <span className={styles.muted}>
                  <span className={styles.badge} data-tone={RISK_TONE[item.risk]}>
                    {RISK_LABELS[item.risk]}
                  </span>{' '}
                  {item.resent ? 'Reenviado' : 'Recibido'} {waiting(item.waitingHours)}
                  {item.overdue && ' · más de 24 h'}
                  {item.missing.length > 0 && ` · faltan ${item.missing.length} requisitos`}
                </span>
                <span
                  className={styles.badge}
                  data-tone={
                    item.overdue ? 'danger' : item.status === 'in_review' ? 'info' : 'neutral'
                  }
                >
                  {PRO_TRADE_STATUS_LABELS[item.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
