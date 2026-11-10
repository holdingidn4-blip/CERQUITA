'use client';

import { useActionState } from 'react';

import styles from '../panel.module.css';
import { saveParam, type ParamState } from './actions';

export function ParamForm({
  k,
  scope,
  value,
  canEdit,
}: {
  k: string;
  scope: string;
  value: string;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<ParamState, FormData>(
    saveParam.bind(null, k, scope),
    { error: null, saved: false },
  );
  return (
    <form action={action} className={styles.inlineForm}>
      <input
        name="value"
        defaultValue={value}
        className={styles.smallInput}
        aria-label={k}
        disabled={!canEdit}
      />
      {canEdit && (
        <button className={styles.secondary} disabled={pending}>
          Guardar
        </button>
      )}
      {state.saved && <span className={styles.muted}>Guardado</span>}
      {state.error && <span className={styles.errorInline}>{state.error}</span>}
    </form>
  );
}
