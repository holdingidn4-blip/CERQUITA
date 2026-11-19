import {
  CRON_JOB_LABELS,
  CRON_STATE_LABELS,
  type CronState,
  cronState,
  type OpsHealth,
  opsIssues,
  timeAgo,
} from '@cerquita/shared';
import type { Metadata } from 'next';

import { createClient } from '@/lib/supabase/server';

import m from '../metricas/metricas.module.css';
import styles from '../panel.module.css';

export const metadata: Metadata = { title: 'Sistema · Cerquita Panel' };

const STATE_TONE: Record<CronState, string> = {
  ok: 'success',
  failed: 'danger',
  running: 'info',
  never: 'neutral',
  paused: 'warning',
};
const STATE_ICON: Record<CronState, string> = {
  ok: '✓',
  failed: '✕',
  running: '…',
  never: '–',
  paused: 'Ⅱ',
};

function Tile({
  label,
  value,
  sub,
  id,
}: {
  label: string;
  value: string;
  sub: string;
  id: string;
}) {
  return (
    <div className={m.tile} data-testid={id}>
      <span className={m.tileLabel}>{label}</span>
      <span className={m.tileValue}>{value}</span>
      <span className={m.tileSub}>{sub}</span>
    </div>
  );
}

export default async function Sistema() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('ops_health');
  if (error || !data) {
    return (
      <>
        <h1 className={styles.h1}>Estado del sistema</h1>
        <p role="alert" className={styles.muted}>
          No se pudo leer el estado. Vuelve a intentarlo en un momento.
        </p>
      </>
    );
  }
  const health = data as unknown as OpsHealth;
  const issues = opsIssues(health);
  const { outbox, http } = health;

  return (
    <>
      <h1 className={styles.h1}>Estado del sistema</h1>
      <p className={styles.muted}>
        Tareas programadas, cola de notificaciones y llamadas salientes. Revisado{' '}
        {timeAgo(health.checked_at)}.
      </p>
      {issues.length === 0 ? (
        <p role="status" className={styles.notice} data-testid="sistema-ok">
          ✓ Todo en orden.
        </p>
      ) : (
        <div role="alert" className={m.alert} data-testid="sistema-avisos">
          <strong>
            {issues.length} {issues.length === 1 ? 'aviso' : 'avisos'}
          </strong>
          <ul>
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      <h2 className={m.h2}>Tareas programadas</h2>
      <table className={styles.table} data-testid="tareas">
        <thead>
          <tr>
            <th>Tarea</th>
            <th>Estado</th>
            <th>Última corrida</th>
            <th>Corridas 24 h</th>
            <th>Fallas 24 h</th>
          </tr>
        </thead>
        <tbody>
          {health.cron.map((job) => {
            const state = cronState(job);
            return (
              <tr key={job.name} data-testid={`tarea-${job.name}`}>
                <td>
                  {CRON_JOB_LABELS[job.name] ?? job.name}
                  <br />
                  <span className={m.note}>
                    {job.name} · <code>{job.schedule}</code>
                  </span>
                </td>
                <td>
                  <span className={styles.badge} data-tone={STATE_TONE[state]}>
                    <span aria-hidden>{STATE_ICON[state]} </span>
                    {CRON_STATE_LABELS[state]}
                  </span>
                  {state === 'failed' && job.last_message && (
                    <>
                      <br />
                      <span className={m.note}>{job.last_message}</span>
                    </>
                  )}
                </td>
                <td>{job.last_start ? timeAgo(job.last_start) : '—'}</td>
                <td className={m.num}>{job.runs_24h}</td>
                <td className={m.num}>{job.failures_24h}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2 className={m.h2}>Cola de notificaciones</h2>
      <section className={m.tiles} aria-label="Cola de notificaciones">
        <Tile
          id="cola-pendientes"
          label="Pendientes"
          value={String(outbox.pending)}
          sub={
            outbox.stale > 0
              ? `${outbox.stale} con más de ${outbox.stale_minutes} min`
              : outbox.oldest_pending
                ? `la más antigua ${timeAgo(outbox.oldest_pending)}`
                : 'Ninguna en espera'
          }
        />
        <Tile
          id="cola-enviadas"
          label="Enviadas en 24 h"
          value={String(outbox.sent_24h)}
          sub={outbox.last_sent ? `última ${timeAgo(outbox.last_sent)}` : 'Aún no se envía ninguna'}
        />
        <Tile
          id="cola-fallidas"
          label="Fallidas u omitidas en 24 h"
          value={String(outbox.failed_24h + outbox.skipped_24h)}
          sub={`${outbox.failed_24h} fallidas · ${outbox.skipped_24h} omitidas (sin teléfono registrado)`}
        />
      </section>

      <h2 className={m.h2}>Llamadas salientes</h2>
      <p className={m.note}>
        Llamadas de la base a las funciones (notificaciones y limpieza). La base guarda las de las
        últimas horas.
      </p>
      <section className={m.tiles} aria-label="Llamadas salientes">
        <Tile
          id="http-total"
          label="Llamadas"
          value={String(http.total)}
          sub={`${http.ok} respondieron bien`}
        />
        <Tile
          id="http-errores"
          label="Con error"
          value={String(http.errors)}
          sub={
            http.last_error
              ? `última ${timeAgo(http.last_error.at)} · ${http.last_error.status ?? 'sin respuesta'}`
              : 'Sin errores'
          }
        />
      </section>
      {http.last_error?.message && (
        <p className={m.note} data-testid="http-ultimo-error">
          Último error: {http.last_error.message}
        </p>
      )}
    </>
  );
}
