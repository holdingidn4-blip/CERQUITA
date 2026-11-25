'use client';

import { useActionState } from 'react';

import type { ActionState } from '../_components/action-form';
import styles from '../panel.module.css';
import { saveSpecialty } from './actions';

export type SpecialtyRow = {
  id: number;
  name: string;
  search_terms: string;
  requires_review: boolean;
  active: boolean;
  sort_order: number;
};

/** Encabezados de las columnas del formulario de cada trabajo. */
export function SpecialtyHead() {
  return (
    <div className={`${styles.catalogRow} ${styles.catalogHead}`} aria-hidden>
      <span>Nombre</span>
      <span>Palabras de búsqueda</span>
      <span>Orden</span>
      <span>Riesgo</span>
      <span>Estado</span>
      <span />
    </div>
  );
}

/** Fila editable de un trabajo, o el alta de uno nuevo si no hay `row`. */
export function SpecialtyForm({ tradeId, row }: { tradeId: number; row?: SpecialtyRow }) {
  const [state, run, pending] = useActionState<ActionState, FormData>(saveSpecialty, {
    error: null,
  });
  const label = row ? row.name : 'Nuevo trabajo';
  return (
    <form
      action={run}
      className={styles.catalogRow}
      data-testid={row ? 'trabajo-catalogo' : 'nuevo-trabajo'}
    >
      <input type="hidden" name="trade" value={tradeId} />
      {row && <input type="hidden" name="id" value={row.id} />}
      <input
        name="name"
        defaultValue={row?.name}
        placeholder="Nombre del trabajo"
        aria-label={`Nombre: ${label}`}
        className={styles.smallInput}
        required
        maxLength={60}
      />
      <input
        name="terms"
        defaultValue={row?.search_terms}
        placeholder="Palabras de búsqueda (ej.: caño gotea)"
        aria-label={`Palabras de búsqueda: ${label}`}
        className={styles.smallInput}
        maxLength={300}
      />
      <input
        name="sort"
        type="number"
        min={0}
        max={999}
        defaultValue={row?.sort_order ?? 100}
        aria-label={`Orden: ${label}`}
        className={styles.smallInput}
      />
      <label className={styles.check}>
        <input type="checkbox" name="risky" defaultChecked={row?.requires_review ?? false} />
        De riesgo
      </label>
      {row ? (
        <label className={styles.check}>
          <input type="checkbox" name="active" defaultChecked={row.active} />
          Activo
        </label>
      ) : (
        <span />
      )}
      <button className={styles[row ? 'secondary' : 'primary']} disabled={pending}>
        {row ? 'Guardar' : 'Agregar'}
      </button>
      {state.error && <span className={styles.errorInline}>{state.error}</span>}
      {state.ok && <span className={styles.muted}>{state.ok}</span>}
    </form>
  );
}
