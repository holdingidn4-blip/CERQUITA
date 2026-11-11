import type { Metadata } from 'next';

import { createClient, requireStaff } from '@/lib/supabase/server';

import styles from '../panel.module.css';
import { ParamForm } from './param-form';

export const metadata: Metadata = { title: 'Parámetros · Cerquita Panel' };

const LABELS: Record<string, string> = {
  commission_rate_bps: 'Tasa de comisión (bps: 1000 = 10 %)',
  debt_limit_cents: 'Límite de deuda (céntimos: 3000 = S/ 30)',
  grace_days: 'Días de gracia sobre el límite',
  launch_promo_jobs: 'Trabajos sin comisión por promoción',
  full_approval_ratings: 'Calificaciones para aprobado pleno',
  full_approval_min_stars: 'Estrellas mínimas que cuentan',
  min_trade_evidence: 'Evidencias mínimas por oficio',
  reject_retry_days: 'Días para reintentar tras rechazo',
  yape_number: 'Yape de la empresa (número)',
  plin_number: 'Plin de la empresa (número)',
  yape_qr_url: 'QR de Yape (URL de imagen)',
  plin_qr_url: 'QR de Plin (URL de imagen)',
  account_holder: 'Titular de la cuenta',
  bank_account: 'Cuenta bancaria (transferencias)',
  push_function_url: 'URL de la Edge Function send-push',
  diagnostic_visit_fee_cents: 'Visita de diagnóstico (céntimos)',
};

export default async function Parametros() {
  const staff = await requireStaff();
  const supabase = await createClient();
  const { data } = await supabase
    .from('settings')
    .select('key, scope, value, updated_at')
    .order('key');
  const canEdit = staff.staffRole === 'admin';
  return (
    <>
      <h1 className={styles.h1}>Parámetros</h1>
      <p className={styles.muted}>
        La app y el servidor leen estos valores de la tabla settings (nunca están fijos en el
        código).
        {canEdit ? '' : ' Solo un administrador puede cambiarlos.'} Los pedidos ya aceptados
        conservan su tasa.
      </p>
      <table className={styles.table}>
        <tbody>
          {(data ?? []).map((row) => (
            <tr key={`${row.key}:${row.scope}`}>
              <td>
                {LABELS[row.key] ?? row.key}
                <div className={styles.muted}>
                  {row.key} · {row.scope}
                </div>
              </td>
              <td>
                <ParamForm
                  k={row.key}
                  scope={row.scope}
                  value={typeof row.value === 'string' ? row.value : JSON.stringify(row.value)}
                  canEdit={canEdit}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
