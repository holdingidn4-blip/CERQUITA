'use client';

import { useActionState } from 'react';

import styles from '../panel.module.css';
import { reviewProof, type ProofState } from './actions';

export function ProofForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ProofState, FormData>(
    reviewProof.bind(null, id),
    { error: null, done: null },
  );
  if (state.done) return <span className={styles.muted}>{state.done}</span>;
  return (
    <form action={action} className={styles.inlineForm}>
      <input
        name="note"
        placeholder="Motivo si rechazas"
        className={styles.smallInput}
        aria-label="Motivo del rechazo"
      />
      <button name="decision" value="approve" className={styles.primary} disabled={pending}>
        Aprobar
      </button>
      <button name="decision" value="reject" className={styles.danger} disabled={pending}>
        Rechazar
      </button>
      {state.error && <span className={styles.errorInline}>{state.error}</span>}
    </form>
  );
}
