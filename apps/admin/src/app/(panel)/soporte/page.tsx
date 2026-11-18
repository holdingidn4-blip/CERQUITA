import {
  formatMinutes,
  responseDue,
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
  const [{ data }, { data: hoursRow }] = await Promise.all([
    supabase
      .from('support_tickets')
      .select(
        'id, category, subject, body, status, staff_reply, created_at, user:profiles!support_tickets_user_id_fkey(id, full_name)',
      )
      .order('status')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('settings')
      .select('value')
      .eq('key', 'support_reply_hours')
      .eq('scope', 'global')
      .maybeSingle(),
  ]);
  // Plazo que la app le promete al usuario (settings: support_reply_hours).
  const replyHours = Number(hoursRow?.value) || 8;
  const open = (data ?? []).filter((t) => t.status === 'open');
  const overdue = open.filter((t) => responseDue(t.created_at, replyHours).overdue).length;
  return (
    <>
      <h1 className={styles.h1}>Ayuda y soporte</h1>
      <p className={styles.muted} data-testid="resumen-tickets">
        {open.length} abiertos · la app promete respuesta en {replyHours} h
        {overdue > 0 && (
          <>
            {' · '}
            <strong>
              {overdue} {overdue === 1 ? 'vencido' : 'vencidos'}
            </strong>
          </>
        )}
      </p>
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
              {t.status === 'open' &&
                (() => {
                  const due = responseDue(t.created_at, replyHours);
                  return (
                    <span
                      className={styles.badge}
                      data-tone={due.overdue ? 'danger' : 'info'}
                      data-testid="plazo-ticket"
                    >
                      {due.overdue
                        ? `Vencido hace ${formatMinutes(due.minutes)}`
                        : `Vence en ${formatMinutes(due.minutes)}`}
                    </span>
                  );
                })()}
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
