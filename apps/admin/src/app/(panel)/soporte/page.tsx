import {
  SUPPORT_CATEGORIES,
  TICKET_STATUS_LABELS,
  timeAgo,
  type SupportCategory,
} from '@cerquita/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/server';

import { ActionForm } from '../_components/action-form';
import { replyTicket } from '../_components/actions';
import styles from '../panel.module.css';

export const metadata: Metadata = { title: 'Soporte · Cerquita Panel' };

export default async function Soporte() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('support_tickets')
    .select(
      'id, category, subject, body, status, staff_reply, created_at, user:profiles!support_tickets_user_id_fkey(id, full_name)',
    )
    .order('status')
    .order('created_at', { ascending: false })
    .limit(100);
  return (
    <>
      <h1 className={styles.h1}>Ayuda y soporte</h1>
      <ul className={styles.queue}>
        {(data ?? []).map((t) => (
          <li key={t.id} className={styles.section} data-testid="ticket">
            <div className={styles.caseHeader}>
              <div>
                <h2>{t.subject}</h2>
                <p className={styles.muted}>
                  <Link href={`/usuarios/${t.user?.id}`}>{t.user?.full_name ?? 'Usuario'}</Link> ·{' '}
                  {SUPPORT_CATEGORIES[t.category as SupportCategory]} · {timeAgo(t.created_at)}
                </p>
              </div>
              <span className={styles.badge} data-tone={t.status === 'open' ? 'warning' : 'info'}>
                {TICKET_STATUS_LABELS[t.status as keyof typeof TICKET_STATUS_LABELS]}
              </span>
            </div>
            <p>{t.body}</p>
            {t.staff_reply && <p className={styles.notice}>Respuesta: {t.staff_reply}</p>}
            {t.status !== 'closed' && (
              <ActionForm
                action={replyTicket.bind(null, t.id)}
                placeholder="Respuesta para el usuario"
                buttons={[
                  { name: 'decision', value: 'reply', label: 'Responder', tone: 'primary' },
                  { name: 'decision', value: 'close', label: 'Responder y cerrar' },
                ]}
              />
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
