import { DOCUMENT_LABELS, proTradeView, timeAgo } from '@cerquita/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { getQueue } from '@/lib/verification';

import styles from '../panel.module.css';

export const metadata: Metadata = { title: 'Verificación · Cerquita Panel' };

const DONE: Record<string, string> = {
  approve: 'Oficio aprobado: queda en observación.',
  needs_info: 'Pedimos más datos al profesional.',
  reject: 'Oficio rechazado.',
};

function summarize(kinds: string[]): string {
  const counts = new Map<string, number>();
  kinds.forEach((k) => counts.set(k, (counts.get(k) ?? 0) + 1));
  return [...counts]
    .map(([kind, n]) =>
      n > 1
        ? `${n} × ${DOCUMENT_LABELS[kind as keyof typeof DOCUMENT_LABELS]}`
        : DOCUMENT_LABELS[kind as keyof typeof DOCUMENT_LABELS],
    )
    .join(', ');
}

export default async function Verificacion({ searchParams }: PageProps<'/verificacion'>) {
  const { hecho } = await searchParams;
  const queue = await getQueue();
  return (
    <>
      <h1 className={styles.h1}>Cola por oficio</h1>
      {typeof hecho === 'string' && DONE[hecho] && (
        <p role="status" className={styles.notice}>
          {DONE[hecho]}
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
                  {item.resent ? 'Reenviado' : 'Enviado'} {timeAgo(item.updatedAt)} ·{' '}
                  {summarize(item.evidence) || 'sin evidencia'}
                </span>
                <span
                  className={styles.badge}
                  data-tone={
                    proTradeView({
                      status: item.status,
                      tradeName: '',
                      ratingsForFull: 3,
                      reason: null,
                    }).tone
                  }
                >
                  {
                    proTradeView({
                      status: item.status,
                      tradeName: '',
                      ratingsForFull: 3,
                      reason: null,
                    }).label
                  }
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
