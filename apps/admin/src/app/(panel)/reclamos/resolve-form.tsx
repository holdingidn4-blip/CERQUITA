'use client';

import { useActionState } from 'react';

import styles from '../panel.module.css';
import { resolveClaim, type ClaimState } from './actions';

export function ResolveForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ClaimState, FormData>(
    resolveClaim.bind(null, id),
    { error: null },
  );
  return (
    <form action={action} className={styles.inlineForm}>
      <input
        name="resolution"
        placeholder="Resolución"
        className={styles.smallInput}
        aria-label="Resolución"
      />
      <button name="status" value="in_review" className={styles.secondary} disabled={pending}>
        En revisión
      </button>
      <button name="status" value="resolved" className={styles.primary} disabled={pending}>
        Resolver
      </button>
      <button name="status" value="rejected" className={styles.danger} disabled={pending}>
        Rechazar
      </button>
      {state.error && <span className={styles.errorInline}>{state.error}</span>}
    </form>
  );
}
