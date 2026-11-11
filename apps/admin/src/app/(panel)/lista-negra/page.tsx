import { timeAgo } from '@cerquita/shared';
import type { Metadata } from 'next';

import { createClient } from '@/lib/supabase/server';

import styles from '../panel.module.css';
import { deactivate } from './actions';
import { AddForm } from './add-form';

export const metadata: Metadata = { title: 'Lista negra · Cerquita Panel' };

export default async function ListaNegra({ searchParams }: PageProps<'/lista-negra'>) {
  const { hecho } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from('blacklisted_locations')
    .select('id, address_text, reason, severity, active, created_at')
    .order('created_at', { ascending: false });
  return (
    <>
      <h1 className={styles.h1}>Lista negra de direcciones</h1>
      {hecho === 'agregada' && (
        <p role="status" className={styles.notice}>
          Dirección agregada.
        </p>
      )}
      <p className={styles.muted}>
        Los técnicos ven solo un aviso discreto de precaución en pedidos a menos de 100 m; nunca el
        motivo. Los clientes no ven nada.
      </p>
      <AddForm />
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Dirección</th>
            <th>Motivo</th>
            <th>Alta</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((b) => (
            <tr key={b.id}>
              <td>{b.address_text ?? '—'}</td>
              <td>{b.reason}</td>
              <td>{timeAgo(b.created_at)}</td>
              <td>
                {b.active ? (
                  <form action={deactivate.bind(null, b.id)}>
                    <button className={styles.secondary}>Desactivar</button>
                  </form>
                ) : (
                  'Inactiva'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
