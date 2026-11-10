import { formatMoney, PRICING_UNIT_LABELS } from '@cerquita/shared';
import type { Metadata } from 'next';

import { createClient } from '@/lib/supabase/server';

import styles from '../panel.module.css';

export const metadata: Metadata = { title: 'Tarifario · Cerquita Panel' };

const STORES: Record<string, string> = {
  promart: 'Promart',
  sodimac: 'Sodimac',
  ferreteria: 'Ferretería',
  otro: 'Otro',
};

export default async function Tarifario() {
  const supabase = await createClient();
  const [cards, catalog] = await Promise.all([
    supabase
      .from('trade_rate_cards')
      .select(
        'id, unit, label, min_cents, suggested_cents, max_cents, visit_fee_cents, currency_code, city_slug, trade:trades(pro_name)',
      )
      .order('trade_id'),
    supabase
      .from('materials_catalog')
      .select('id, store, brand, name, unit, reference_price_cents, currency_code, active')
      .order('store'),
  ]);
  return (
    <>
      <h1 className={styles.h1}>Tarifario y catálogo · Huancayo</h1>
      <p className={styles.muted}>
        El tarifario fija el rango de precios (sin regateo) y la tarifa de visita. Los materiales
        son precios de referencia; el reembolso se hace con la boleta. Un administrador los carga en
        las tablas trade_rate_cards y materials_catalog.
      </p>
      <h2>Tarifario sugerido</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Oficio</th>
            <th>Unidad</th>
            <th>Mínimo</th>
            <th>Sugerido</th>
            <th>Máximo</th>
            <th>Visita</th>
          </tr>
        </thead>
        <tbody>
          {(cards.data ?? []).map((c) => (
            <tr key={c.id}>
              <td>
                {c.trade?.pro_name} · {c.label}
              </td>
              <td>{PRICING_UNIT_LABELS[c.unit].per}</td>
              <td>{formatMoney(c.min_cents, c.currency_code)}</td>
              <td>{formatMoney(c.suggested_cents, c.currency_code)}</td>
              <td>{formatMoney(c.max_cents, c.currency_code)}</td>
              <td>
                {c.visit_fee_cents === null ? '—' : formatMoney(c.visit_fee_cents, c.currency_code)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Catálogo de materiales</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Tienda</th>
            <th>Material</th>
            <th>Unidad</th>
            <th>Precio de referencia</th>
          </tr>
        </thead>
        <tbody>
          {(catalog.data ?? []).map((m) => (
            <tr key={m.id}>
              <td>{STORES[m.store] ?? m.store}</td>
              <td>
                {m.brand} {m.name}
                {!m.active && <span className={styles.muted}> (inactivo)</span>}
              </td>
              <td>{m.unit}</td>
              <td>{formatMoney(m.reference_price_cents, m.currency_code)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
