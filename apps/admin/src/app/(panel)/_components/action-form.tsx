'use client';

import { useActionState } from 'react';

import styles from '../panel.module.css';

export type ActionState = { error: string | null; ok?: string | null };
type Button = {
  name?: string;
  value?: string;
  label: string;
  tone?: 'primary' | 'secondary' | 'danger';
};

/** Formulario genérico de acción con nota (motivo/resolución) para las páginas del panel. */
export function ActionForm({
  action,
  buttons,
  placeholder = 'Nota (obligatoria)',
  fields = [],
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  buttons: Button[];
  placeholder?: string;
  fields?: { name: string; placeholder: string; defaultValue?: string }[];
}) {
  const [state, run, pending] = useActionState<ActionState, FormData>(action, { error: null });
  return (
    <form action={run} className={styles.inlineForm}>
      {fields.map((f) => (
        <input
          key={f.name}
          name={f.name}
          placeholder={f.placeholder}
          defaultValue={f.defaultValue}
          aria-label={f.placeholder}
          className={styles.smallInput}
        />
      ))}
      {placeholder && (
        <input
          name="note"
          placeholder={placeholder}
          aria-label={placeholder}
          className={styles.smallInput}
        />
      )}
      {buttons.map((b) => (
        <button
          key={b.label}
          name={b.name}
          value={b.value}
          className={styles[b.tone ?? 'secondary']}
          disabled={pending}
        >
          {b.label}
        </button>
      ))}
      {state.error && <span className={styles.errorInline}>{state.error}</span>}
      {state.ok && <span className={styles.muted}>{state.ok}</span>}
    </form>
  );
}
