import { formatLimaDateTime, timeAgo } from '@cerquita/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/server';

import { ActionForm } from '../_components/action-form';
import { liftBlacklist, reviewBlacklistAppeal } from '../_components/actions';
import styles from '../panel.module.css';
import { deactivate } from './actions';
import { AddForm } from './add-form';

export const metadata: Metadata = { title: 'Lista negra · Cerquita Panel' };

export default async function ListaNegra({ searchParams }: PageProps<'/lista-negra'>) {
  const { hecho } = await searchParams;
  const supabase = await createClient();
  const { data: people } = await supabase
    .from('blacklist_entries')
    .select(
      'id, reason, until, created_at, lifted_at, dni_number, device_hashes, appeal_text, appeal_status, appeal_note, profile:profiles!blacklist_entries_profile_id_fkey(id, full_name)',
    )
    .order('created_at', { ascending: false })
    .limit(100);
  const now = new Date().toISOString();
  const state = (b: NonNullable<typeof people>[number]) =>
    b.lifted_at
      ? 'Levantada'
      : b.appeal_status === 'accepted'
        ? 'Apelación aceptada'
        : b.until && b.until < now
          ? 'Vencida'
          : 'Vigente';
  const { data } = await supabase
    .from('blacklisted_locations')
    .select('id, address_text, reason, severity, active, created_at')
    .order('created_at', { ascending: false });
  return (
    <>
      <h1 className={styles.h1}>Lista negra</h1>
      <h2 className={styles.h2}>Personas</h2>
      <p className={styles.muted}>
        Se agregan desde la ficha del usuario, con motivo y plazo. Quedan vinculadas a su DNI y a
        sus teléfonos: no pueden pedir, cotizar ni registrarse otra vez. La persona puede apelar una
        vez y decide una persona del equipo.
      </p>
      <table className={styles.table} data-testid="lista-negra-personas">
        <thead>
          <tr>
            <th>Persona</th>
            <th>Motivo y plazo</th>
            <th>Vínculos</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {(people ?? []).map((b) => (
            <tr key={b.id}>
              <td>
                {b.profile ? (
                  <Link href={`/usuarios/${b.profile.id}`}>
                    {b.profile.full_name ?? 'Sin nombre'}
                  </Link>
                ) : (
                  'Cuenta eliminada'
                )}
                <div className={styles.muted}>{timeAgo(b.created_at)}</div>
              </td>
              <td>
                {b.reason}
                <div className={styles.muted}>
                  {b.until ? `Hasta ${formatLimaDateTime(b.until)}` : 'Indefinida'}
                </div>
              </td>
              <td>
                {b.dni_number ? `DNI ····${b.dni_number.slice(-4)}` : 'Sin DNI'} ·{' '}
                {b.device_hashes.length} teléfono{b.device_hashes.length === 1 ? '' : 's'}
              </td>
              <td>
                <span
                  className={styles.badge}
                  data-tone={state(b) === 'Vigente' ? 'danger' : undefined}
                >
                  {state(b)}
                </span>
                {b.appeal_text && (
                  <p className={styles.muted}>
                    Apelación: “{b.appeal_text}”
                    {b.appeal_note ? ` · Respuesta: ${b.appeal_note}` : ''}
                  </p>
                )}
                {b.appeal_status === 'pending' && (
                  <ActionForm
                    action={reviewBlacklistAppeal.bind(null, b.id)}
                    placeholder="Motivo de la decisión"
                    buttons={[
                      {
                        name: 'decision',
                        value: 'accept',
                        label: 'Aceptar apelación',
                        tone: 'primary',
                      },
                      { name: 'decision', value: 'reject', label: 'Rechazar', tone: 'danger' },
                    ]}
                  />
                )}
                {state(b) === 'Vigente' && b.appeal_status !== 'pending' && (
                  <ActionForm
                    action={liftBlacklist.bind(null, b.id)}
                    placeholder="Motivo para levantar"
                    buttons={[{ label: 'Levantar', tone: 'secondary' }]}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className={styles.h2}>Direcciones</h2>
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
