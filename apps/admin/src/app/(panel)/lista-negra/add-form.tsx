'use client';

import { useActionState } from 'react';

import styles from '../panel.module.css';
import { addLocation, type BlacklistState } from './actions';

export function AddForm() {
  const [state, action, pending] = useActionState<BlacklistState, FormData>(addLocation, {
    error: null,
  });
  return (
    <form action={action} className={styles.section}>
      <h2>Agregar dirección</h2>
      <div className={styles.inlineForm}>
        <input
          name="lat"
          placeholder="Latitud (-12.0651)"
          className={styles.smallInput}
          aria-label="Latitud"
        />
        <input
          name="lng"
          placeholder="Longitud (-75.2049)"
          className={styles.smallInput}
          aria-label="Longitud"
        />
        <input
          name="address"
          placeholder="Dirección (opcional)"
          className={styles.smallInput}
          aria-label="Dirección"
        />
        <input
          name="reason"
          placeholder="Motivo (solo soporte)"
          className={styles.smallInput}
          aria-label="Motivo"
        />
        <button className={styles.danger} disabled={pending}>
          Agregar
        </button>
      </div>
      {state.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
