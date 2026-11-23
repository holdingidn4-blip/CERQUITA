import {
  formatEntryAmount,
  formatSoles,
  isoDaysAgo,
  maskPhone,
  PRO_TRADE_STATUS_LABELS,
  REPORT_REASONS,
  REPORT_STATUS_LABELS,
  ROLE_LABELS,
  SERVICE_LABELS,
  timeAgo,
  WALLET_ENTRY_LABELS,
  type ReportReason,
} from '@cerquita/shared';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { createClient, requireStaff } from '@/lib/supabase/server';

import { ActionForm } from '../../_components/action-form';
import { blacklistPerson, reverseEntry, setSuspension } from '../../_components/actions';
import styles from '../../panel.module.css';

export default async function Usuario({ params }: PageProps<'/usuarios/[id]'>) {
  const { id } = await params;
  const staff = await requireStaff();
  const supabase = await createClient();
  const { data: windowRow } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'no_show_window_days')
    .eq('scope', 'global')
    .maybeSingle();
  // Ventana de llegadas incumplidas (settings: no_show_window_days).
  const windowDays = Number(windowRow?.value) || 30;
  const { data: blacklist } = await supabase
    .from('blacklist_entries')
    .select('id, reason, until, lifted_at, appeal_status')
    .eq('profile_id', id)
    .is('lifted_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  const nowIso = new Date().toISOString();
  const blacklisted = (blacklist ?? []).find(
    (b) => b.appeal_status !== 'accepted' && (!b.until || b.until > nowIso),
  );
  const [
    { data: p },
    { data: trades },
    { data: entries },
    { data: reports },
    { data: jobs },
    { data: debt },
    { data: noShows },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'id, full_name, phone, active_role, created_at, deleted_at, suspended_at, suspended_reason',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase.from('pro_trades').select('id, status, trade:trades(pro_name)').eq('pro_id', id),
    supabase
      .from('wallet_entries')
      .select(
        'id, type, amount_cents, balance_after_cents, idempotency_key, created_at, external_ref',
      )
      .eq('professional_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('user_reports')
      .select('id, reason, details, status, created_at')
      .eq('reported_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('jobs')
      .select('id, description, status, created_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.rpc('pro_debt', { p_pro: id }),
    supabase
      .from('pro_no_shows')
      .select('id, reported_at')
      .eq('pro_id', id)
      .gte('reported_at', isoDaysAgo(windowDays)),
  ]);
  if (!p) notFound();
  const isAdmin = staff.staffRole === 'admin';
  const reversed = new Set(
    (entries ?? [])
      .filter((e) => e.type === 'reversal')
      .map((e) => e.idempotency_key.replace('reversal:', '')),
  );
  return (
    <>
      <Link href="/buscar" className={styles.back}>
        ← Buscar
      </Link>
      <header className={styles.caseHeader}>
        <div>
          <h1 className={styles.h1}>{p.full_name ?? 'Sin nombre'}</h1>
          <p className={styles.muted}>
            {maskPhone(p.phone)} · modo {ROLE_LABELS[p.active_role]} · desde {timeAgo(p.created_at)}
            {p.deleted_at ? ' · cuenta eliminada' : ''}
          </p>
        </div>
        {p.suspended_at && (
          <span className={styles.badge} data-tone="danger">
            Suspendido: {p.suspended_reason}
          </span>
        )}
      </header>

      <section className={styles.section} data-testid="ficha-lista-negra">
        <h2>Lista negra</h2>
        <p className={styles.muted}>
          No podrá pedir, cotizar ni registrarse otra vez (se vincula a su DNI y sus teléfonos).
          Sigue pudiendo entrar para ver el motivo y apelar.
        </p>
        {blacklisted ? (
          <p>
            <span className={styles.badge} data-tone="danger">
              En la lista negra: {blacklisted.reason}
            </span>{' '}
            <Link href="/lista-negra">Ver en Lista negra</Link>
          </p>
        ) : staff.staffRole === 'reviewer' ? (
          <p className={styles.muted}>Solo soporte o un administrador puede agregar.</p>
        ) : (
          <ActionForm
            action={blacklistPerson.bind(null, id)}
            placeholder="Motivo de la lista negra"
            fields={[{ name: 'days', placeholder: 'Días (vacío = indefinido)' }]}
            buttons={[{ label: 'Agregar a la lista negra', tone: 'danger' }]}
          />
        )}
      </section>

      <section className={styles.section}>
        <h2>Suspensión manual</h2>
        <p className={styles.muted}>
          Bloquea el acceso (Auth), cierra sus sesiones y lo saca de línea. Queda auditado.
        </p>
        {isAdmin ? (
          <ActionForm
            action={setSuspension.bind(null, id)}
            placeholder="Motivo"
            buttons={
              p.suspended_at
                ? [
                    {
                      name: 'decision',
                      value: 'unsuspend',
                      label: 'Levantar suspensión',
                      tone: 'primary',
                    },
                  ]
                : [
                    {
                      name: 'decision',
                      value: 'suspend',
                      label: 'Suspender cuenta',
                      tone: 'danger',
                    },
                  ]
            }
          />
        ) : (
          <p className={styles.muted}>Solo un administrador puede suspender.</p>
        )}
      </section>

      {(trades ?? []).length > 0 && (
        <section className={styles.section}>
          <h2>Oficios</h2>
          <p>
            {(trades ?? [])
              .map((t) => `${t.trade?.pro_name} (${PRO_TRADE_STATUS_LABELS[t.status]})`)
              .join(' · ')}
          </p>
          <p className={styles.muted} data-testid="llegadas-incumplidas">
            Llegadas incumplidas en {windowDays} días: {(noShows ?? []).length}
          </p>
          {debt?.[0] && (
            <p className={styles.muted}>
              Comisión pendiente: {formatSoles(debt[0].pending_cents)}
              {debt[0].paused ? ' · en pausa' : ''}
            </p>
          )}
        </section>
      )}

      {(entries ?? []).length > 0 && (
        <section className={styles.section}>
          <h2>Libro de comisiones</h2>
          <table className={styles.table}>
            <tbody>
              {(entries ?? []).map((e) => (
                <tr key={e.id}>
                  <td>
                    {WALLET_ENTRY_LABELS[e.type]}
                    <div className={styles.muted}>
                      {e.external_ref ?? e.idempotency_key} · {timeAgo(e.created_at)}
                    </div>
                  </td>
                  <td>{formatEntryAmount(e.amount_cents)}</td>
                  <td>saldo {formatEntryAmount(e.balance_after_cents)}</td>
                  <td>
                    {isAdmin && e.type !== 'reversal' && !reversed.has(e.id) ? (
                      <ActionForm
                        action={reverseEntry.bind(null, e.id, id)}
                        placeholder="Motivo de la reversión"
                        buttons={[{ label: 'Revertir', tone: 'danger' }]}
                      />
                    ) : reversed.has(e.id) ? (
                      <span className={styles.muted}>Revertido</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {(reports ?? []).length > 0 && (
        <section className={styles.section}>
          <h2>Reportes recibidos</h2>
          <ul>
            {(reports ?? []).map((r) => (
              <li key={r.id}>
                {REPORT_REASONS[r.reason as ReportReason]} ·{' '}
                {REPORT_STATUS_LABELS[r.status] ?? r.status} · {timeAgo(r.created_at)}{' '}
                {r.details ? `— ${r.details}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(jobs ?? []).length > 0 && (
        <section className={styles.section}>
          <h2>Pedidos como cliente</h2>
          <ul>
            {(jobs ?? []).map((j) => (
              <li key={j.id}>
                <Link href={`/pedidos/${j.id}`}>{j.description}</Link> · {SERVICE_LABELS[j.status]}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
