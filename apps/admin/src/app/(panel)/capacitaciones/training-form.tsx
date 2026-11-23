'use client';

import { useActionState } from 'react';

import styles from '../panel.module.css';
import { createTraining, type TrainingState } from './actions';

const QUIZ_HINT =
  '¿Qué haces antes de tocar un cable? | Nada | *Corto la luz | Lo mojo\n¿Cómo se paga el trabajo? | *Directo al profesional | A Cerquita';

/** Nueva charla: datos, puntos y cuestionario (una pregunta por línea, la correcta con *). */
export function TrainingForm({ trades }: { trades: { id: number; name: string }[] }) {
  const [state, run, pending] = useActionState<TrainingState, FormData>(createTraining, {
    error: null,
  });
  // Tras un error, el formulario vuelve con lo escrito (React lo vacía al terminar la acción).
  const v = state.values ?? {};
  return (
    <form
      action={run}
      className={styles.section}
      data-testid="nueva-capacitacion"
      key={state.values ? JSON.stringify(state.values) : 'nuevo'}
    >
      <h2>Nueva capacitación</h2>
      <div className={styles.formGrid}>
        <input
          name="title"
          defaultValue={v.title}
          placeholder="Título"
          aria-label="Título"
          className={styles.smallInput}
          required
        />
        <input
          name="place"
          defaultValue={v.place}
          placeholder="Lugar"
          aria-label="Lugar"
          className={styles.smallInput}
          required
        />
        <input
          name="starts_at"
          defaultValue={v.starts_at}
          type="datetime-local"
          aria-label="Fecha y hora (Lima)"
          className={styles.smallInput}
          required
        />
        <input
          name="city"
          defaultValue={v.city ?? 'huancayo'}
          aria-label="Ciudad"
          className={styles.smallInput}
        />
        <select
          name="trade"
          aria-label="Oficio"
          className={styles.smallInput}
          defaultValue={v.trade ?? ''}
        >
          <option value="">Todos los oficios</option>
          {trades.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input
          name="points"
          defaultValue={v.points ?? '50'}
          aria-label="Puntos"
          className={styles.smallInput}
        />
        <input
          name="pass_pct"
          defaultValue={v.pass_pct ?? '70'}
          aria-label="Porcentaje para aprobar"
          className={styles.smallInput}
        />
      </div>
      <input
        name="description"
        defaultValue={v.description}
        placeholder="Descripción (opcional)"
        aria-label="Descripción"
        className={styles.smallInput}
      />
      <p className={styles.muted}>
        Cuestionario: una pregunta por línea, opciones separadas por “|” y la correcta con “*”.
      </p>
      <textarea
        name="quiz"
        defaultValue={v.quiz}
        aria-label="Cuestionario"
        className={styles.textarea}
        placeholder={QUIZ_HINT}
      />
      <div className={styles.inlineForm}>
        <button className={styles.primary} disabled={pending}>
          Crear capacitación
        </button>
        {state.error && <span className={styles.errorInline}>{state.error}</span>}
        {state.ok && <span className={styles.muted}>{state.ok}</span>}
      </div>
    </form>
  );
}
