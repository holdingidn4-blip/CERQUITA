import { formatMoney, PRICING_UNIT_LABELS } from '@cerquita/shared';
import type { Metadata } from 'next';

import { createClient, requireStaff } from '@/lib/supabase/server';

import { ActionForm } from '../_components/action-form';
import { addCatalogItem, saveCatalogItem, saveRateCard } from '../_components/actions';
import styles from '../panel.module.css';

export const metadata: Metadata = { title: 'Tarifario · Cerquita Panel' };

const STORES: Record<string, string> = {
  promart: 'Promart',
  sodimac: 'Sodimac',
  maestro: 'Maestro',
  ferreteria: 'Ferretería',
  otro: 'Otro',
};
const soles = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2));

export default async function Tarifario() {
  const staff = await requireStaff();
  const canEdit = staff.staffRole === 'admin';
  const supabase = await createClient();
  const [cards, catalog] = await Promise.all([
    supabase
      .from('trade_rate_cards')
      .select(
        'id, unit, label, min_cents, suggested_cents, max_cents, visit_fee_cents, currency_code, trade:trades(pro_name)',
      )
      .order('trade_id'),
    supabase
      .from('materials_catalog')
      .select('id, store, brand, name, unit, reference_price_cents, currency_code, active')
      .order('store')
      .order('name'),
  ]);
  return (
    <>
      <h1 className={styles.h1}>Tarifario y catálogo · Huancayo</h1>
      <p className={styles.muted}>
        Los cambios rigen al instante para pedidos y ofertas nuevos (los aceptados conservan su
        precio). Montos en soles.
        {canEdit ? '' : ' Solo un administrador puede editar.'}
      </p>
      <h2>Tarifario sugerido</h2>
      <table className={styles.table}>
        <tbody>
          {(cards.data ?? []).map((c) => (
            <tr key={c.id} data-testid="tarifa">
              <td>
                {c.trade?.pro_name} · {c.label}
                <div className={styles.muted}>
                  {PRICING_UNIT_LABELS[c.unit].per} · hoy{' '}
                  {formatMoney(c.min_cents, c.currency_code)} –{' '}
                  {formatMoney(c.max_cents, c.currency_code)}
                </div>
              </td>
              <td>
                {canEdit && (
                  <ActionForm
                    action={saveRateCard.bind(null, c.id)}
                    placeholder=""
                    fields={[
                      { name: 'min', placeholder: 'Mínimo', defaultValue: soles(c.min_cents) },
                      {
                        name: 'suggested',
                        placeholder: 'Sugerido',
                        defaultValue: soles(c.suggested_cents),
                      },
                      { name: 'max', placeholder: 'Máximo', defaultValue: soles(c.max_cents) },
                      {
                        name: 'visit',
                        placeholder: 'Visita',
                        defaultValue: soles(c.visit_fee_cents),
                      },
                    ]}
                    buttons={[{ label: 'Guardar', tone: 'primary' }]}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Catálogo de materiales</h2>
      {canEdit && (
        <ActionForm
          action={addCatalogItem}
          placeholder=""
          fields={[
            { name: 'store', placeholder: 'Tienda (promart, sodimac, maestro…)' },
            { name: 'brand', placeholder: 'Marca' },
            { name: 'name', placeholder: 'Nombre del material' },
            { name: 'unit', placeholder: 'Unidad' },
            { name: 'price', placeholder: 'Precio S/' },
          ]}
          buttons={[{ label: 'Agregar material', tone: 'primary' }]}
        />
      )}
      <table className={styles.table}>
        <tbody>
          {(catalog.data ?? []).map((m) => (
            <tr key={m.id}>
              <td>
                {STORES[m.store] ?? m.store} · {m.brand} {m.name}
                <div className={styles.muted}>
                  {m.unit} · {formatMoney(m.reference_price_cents, m.currency_code)}
                  {!m.active && ' · inactivo'}
                </div>
              </td>
              <td>
                {canEdit && (
                  <ActionForm
                    action={saveCatalogItem.bind(null, m.id)}
                    placeholder=""
                    fields={[
                      {
                        name: 'price',
                        placeholder: 'Precio S/',
                        defaultValue: soles(m.reference_price_cents),
                      },
                    ]}
                    buttons={[
                      { name: 'decision', value: 'activate', label: 'Guardar', tone: 'primary' },
                      { name: 'decision', value: 'deactivate', label: 'Desactivar' },
                    ]}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
