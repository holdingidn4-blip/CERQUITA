import {
  DOCUMENT_LABELS,
  maskPhone,
  timeAgo,
  type VerificationDocumentKind,
} from '@cerquita/shared';
import type { Metadata } from 'next';

import { createClient } from '@/lib/supabase/server';

import styles from '../panel.module.css';
import { ResolveForm } from './resolve-form';

export const metadata: Metadata = { title: 'Reclamos · Cerquita Panel' };
const STATUS: Record<string, string> = {
  open: 'Abierto',
  in_review: 'En revisión',
  resolved: 'Resuelto',
  rejected: 'Rechazado',
};

export default async function Reclamos() {
  const supabase = await createClient();
  const { data } = await supabase.rpc('claims_queue');
  return (
    <>
      <h1 className={styles.h1}>Reclamos</h1>
      <p className={styles.muted}>
        Solo de servicios contratados en la app. Puedes ver la identidad verificada del técnico;
        cada vista queda registrada con fecha y revisor. Entrégala al cliente o a la autoridad solo
        por el canal formal del reclamo.
      </p>
      {(data ?? []).length === 0 ? (
        <p className={styles.muted}>No hay reclamos.</p>
      ) : (
        <ul className={styles.queue}>
          {(data ?? []).map((c) => (
            <li key={c.id} className={styles.section} data-testid="reclamo">
              <div className={styles.caseHeader}>
                <div>
                  <h2>
                    {c.client_name ?? 'Cliente'} → {c.pro_name ?? 'Técnico'} · {c.job_description}
                  </h2>
                  <p className={styles.muted}>
                    {timeAgo(c.created_at)} · técnico {maskPhone(c.pro_phone)}
                  </p>
                </div>
                <span className={styles.badge} data-tone={c.status === 'open' ? 'warning' : 'info'}>
                  {STATUS[c.status] ?? c.status}
                </span>
              </div>
              <p>{c.description}</p>
              <ul className={styles.docs}>
                {(c.identity_docs as { id: string; kind: VerificationDocumentKind }[]).map((d) => (
                  <li key={d.id} className={styles.doc}>
                    <span>{DOCUMENT_LABELS[d.kind]}</span>
                    <a
                      href={`/documentos/${d.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.docLink}
                    >
                      Ver
                    </a>
                  </li>
                ))}
              </ul>
              {['open', 'in_review'].includes(c.status) && <ResolveForm id={c.id} />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
