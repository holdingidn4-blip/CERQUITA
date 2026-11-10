'use client';

import { useActionState } from 'react';

import styles from '../panel.module.css';
import { closeAlert, type SosState } from './actions';

export function CloseForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<SosState, FormData>(closeAlert.bind(null, id), {
    error: null,
  });
  return (
    <form action={action} className={styles.inlineForm}>
      <input
        name="note"
        placeholder="Nota de cierre (qué se hizo)"
        className={styles.smallInput}
        aria-label="Nota de cierre"
      />
      <button className={styles.danger} disabled={pending}>
        Cerrar alerta
      </button>
      {state.error && <span className={styles.errorInline}>{state.error}</span>}
    </form>
  );
}
