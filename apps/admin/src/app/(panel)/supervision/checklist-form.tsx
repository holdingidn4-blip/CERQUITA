'use client';

import { useActionState } from 'react';

import type { ActionState } from '../_components/action-form';
import styles from '../panel.module.css';

const ITEMS = [
  ['arrival', 'Llegó a la hora acordada'],
  ['treatment', 'Trato respetuoso con el cliente'],
  ['scope', 'Hizo lo acordado (sin cobros extra)'],
  ['safety', 'Trabajó de forma segura'],
] as const;

/** Checklist de supervisión: marca lo que estuvo bien; si algo falló, la nota es obligatoria. */
export function ChecklistForm({
  action,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
}) {
  const [state, run, pending] = useActionState<ActionState, FormData>(action, { error: null });
  return (
    <form action={run} className={styles.inlineForm} data-testid="checklist">
      {ITEMS.map(([name, label]) => (
        <label key={name} className={styles.check}>
          <input type="checkbox" name={name} defaultChecked /> {label}
        </label>
      ))}
      <input
        name="note"
        placeholder="Qué falló o cómo fue (lo cuenta el cliente)"
        aria-label="Nota de supervisión"
        className={styles.smallInput}
      />
      <button className={styles.primary} disabled={pending}>
        Guardar checklist
      </button>
      {state.error && <span className={styles.errorInline}>{state.error}</span>}
      {state.ok && <span className={styles.muted}>{state.ok}</span>}
    </form>
  );
}
