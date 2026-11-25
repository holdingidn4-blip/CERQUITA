import { formatLimaDateTime } from '@cerquita/shared';
import type { Metadata } from 'next';

import { createClient } from '@/lib/supabase/server';

import { ActionForm } from '../_components/action-form';
import styles from '../panel.module.css';
import { reviewRequest } from './actions';
import { SpecialtyForm, SpecialtyHead } from './specialty-form';

export const metadata: Metadata = { title: 'Catálogo de trabajos · Cerquita Panel' };

/**
 * Catálogo de trabajos por oficio (lo que el cliente elige y el profesional marca) y los "otros
 * trabajos" que piden los profesionales. Los de riesgo se aprueban a cada profesional por separado.
 */
export default async function Catalogo() {
  const supabase = await createClient();
  const [{ data: trades }, { data: specialties }, { data: requests }] = await Promise.all([
    supabase.from('trades').select('id, name').order('id'),
    supabase
      .from('trade_specialties')
      .select('id, trade_id, name, search_terms, requires_review, active, sort_order')
      .order('sort_order')
      .order('id'),
    supabase
      .from('specialty_requests')
      .select(
        'id, name, created_at, pro_trade:pro_trades(trade:trades(name)), pro:profiles!specialty_requests_pro_id_fkey(full_name)',
      )
      .eq('status', 'pending')
      .order('created_at'),
  ]);
  const pending = requests ?? [];
  return (
    <>
      <h1 className={styles.h1}>Catálogo de trabajos</h1>
      <p className={styles.muted}>
        El cliente elige el trabajo al pedir y el profesional marca los que hace. Los marcados “de
        riesgo” se aprueban a cada profesional por separado en Verificación. Solo soporte o
        administración edita el catálogo.
      </p>

      <section className={styles.section} data-testid="otros-trabajos">
        <h2>Otros trabajos pedidos por profesionales ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className={styles.muted}>No hay pedidos pendientes.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Trabajo pedido</th>
                <th>Oficio</th>
                <th>Profesional</th>
                <th>Decisión</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id} data-testid="otro-trabajo">
                  <td>
                    “{r.name}”<div className={styles.muted}>{formatLimaDateTime(r.created_at)}</div>
                  </td>
                  <td>{r.pro_trade?.trade?.name ?? '—'}</td>
                  <td>{r.pro?.full_name ?? 'Sin nombre'}</td>
                  <td>
                    <ActionForm
                      action={reviewRequest.bind(null, r.id)}
                      fields={[
                        {
                          name: 'name',
                          placeholder: 'Nombre en el catálogo',
                          defaultValue: r.name,
                        },
                      ]}
                      placeholder="Motivo si rechazas"
                      buttons={[
                        { name: 'decision', value: 'approve', label: 'Agregar', tone: 'primary' },
                        {
                          name: 'decision',
                          value: 'approve_risky',
                          label: 'Agregar como de riesgo',
                        },
                        { name: 'decision', value: 'reject', label: 'Rechazar', tone: 'danger' },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {(trades ?? []).map((t) => {
        const rows = (specialties ?? []).filter((s) => s.trade_id === t.id);
        const active = rows.filter((s) => s.active).length;
        return (
          <details key={t.id} className={styles.section} data-testid={`catalogo-oficio-${t.id}`}>
            <summary>
              <strong>{t.name}</strong>{' '}
              <span className={styles.muted}>
                · {active} trabajos activos · {rows.filter((s) => s.requires_review).length} de
                riesgo
              </span>
            </summary>
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              <SpecialtyHead />
              {rows.map((s) => (
                <SpecialtyForm key={s.id} tradeId={t.id} row={s} />
              ))}
              <SpecialtyForm tradeId={t.id} />
            </div>
          </details>
        );
      })}
    </>
  );
}
