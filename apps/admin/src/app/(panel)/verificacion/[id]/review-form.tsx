'use client';

import { useActionState } from 'react';

import { decide, type ReviewState } from '../actions';
import styles from '../../panel.module.css';

export function ReviewForm({ id, canApprove }: { id: string; canApprove: boolean }) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(decide.bind(null, id), {
    error: null,
  });
  return (
    <form action={action} className={styles.section}>
      <label className={styles.label}>
        Motivo (obligatorio para pedir datos o rechazar)
        <textarea
          name="reason"
          rows={3}
          className={styles.textarea}
          placeholder="Escribe qué falta o por qué se rechaza"
        />
      </label>
      {state.error && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}
      {!canApprove && (
        <p className={styles.muted}>No se puede aprobar: falta identidad o evidencia.</p>
      )}
      <div className={styles.actions}>
        <button
          name="decision"
          value="approve"
          className={styles.primary}
          disabled={pending || !canApprove}
        >
          Aprobar (en observación)
        </button>
        <button name="decision" value="needs_info" className={styles.secondary} disabled={pending}>
          Pedir más datos
        </button>
        <button name="decision" value="reject" className={styles.danger} disabled={pending}>
          Rechazar
        </button>
      </div>
    </form>
  );
}
