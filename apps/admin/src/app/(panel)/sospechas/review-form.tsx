'use client';

import { useActionState } from 'react';

import styles from '../panel.module.css';
import { reviewSuspicion, type BypassState } from './actions';

export function ReviewForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<BypassState, FormData>(
    reviewSuspicion.bind(null, id),
    { error: null },
  );
  return (
    <form action={action} className={styles.inlineForm}>
      <input
        name="note"
        placeholder="Nota (qué se verificó)"
        className={styles.smallInput}
        aria-label="Nota de la revisión"
      />
      <button name="decision" value="confirm" className={styles.danger} disabled={pending}>
        Confirmar fraude
      </button>
      <button name="decision" value="dismiss" className={styles.secondary} disabled={pending}>
        Descartar
      </button>
      {state.error && <span className={styles.errorInline}>{state.error}</span>}
    </form>
  );
}
