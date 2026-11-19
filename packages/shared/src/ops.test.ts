import { describe, expect, it } from 'vitest';
import { type CronJobHealth, cronState, type OpsHealth, opsIssues } from './ops';

const push: CronJobHealth = {
  name: 'dispatch-push',
  schedule: '* * * * *',
  active: true,
  last_start: '2026-11-19T14:59:00Z',
  last_end: '2026-11-19T14:59:00Z',
  last_status: 'succeeded',
  last_message: '1 row',
  runs_24h: 1440,
  failures_24h: 0,
};
const purge: CronJobHealth = {
  name: 'purge-outbox',
  schedule: '27 3 * * *',
  active: true,
  last_start: null,
  last_end: null,
  last_status: null,
  last_message: null,
  runs_24h: 0,
  failures_24h: 0,
};
const healthy: OpsHealth = {
  checked_at: '2026-11-19T15:00:00Z',
  cron: [push, purge],
  outbox: {
    pending: 1,
    stale: 0,
    oldest_pending: '2026-11-19T14:59:30Z',
    sent_24h: 4,
    failed_24h: 0,
    skipped_24h: 0,
    last_sent: '2026-11-19T14:58:00Z',
    stale_minutes: 10,
  },
  http: { total: 6, ok: 6, errors: 0, last_error: null },
};

describe('cronState', () => {
  it.each([
    [{ active: false, last_status: 'succeeded' }, 'paused'],
    [{ active: true, last_status: null }, 'never'],
    [{ active: true, last_status: 'failed' }, 'failed'],
    [{ active: true, last_status: 'succeeded' }, 'ok'],
    [{ active: true, last_status: 'running' }, 'running'],
  ] as const)('%j → %s', (job, expected) => expect(cronState(job)).toBe(expected));
});

describe('opsIssues', () => {
  it('sin avisos cuando todo anda (una tarea que aún no corre no es un problema)', () => {
    expect(opsIssues(healthy)).toEqual([]);
  });
  it('avisa tareas falladas o pausadas, cola atascada y errores HTTP', () => {
    const broken: OpsHealth = {
      ...healthy,
      cron: [
        { ...push, last_status: 'failed' },
        { ...purge, active: false },
      ],
      outbox: { ...healthy.outbox, stale: 3 },
      http: { ...healthy.http, errors: 1 },
    };
    expect(opsIssues(broken)).toEqual([
      'Envío de notificaciones (cada minuto): falló la última corrida',
      'Limpieza de notificaciones de más de 30 días (diario): está pausada',
      '3 notificaciones llevan más de 10 min en cola',
      '1 llamada saliente falló en las últimas horas',
    ]);
  });
  it('una tarea desconocida se muestra con su nombre', () => {
    const extra: OpsHealth = {
      ...healthy,
      cron: [{ ...push, name: 'nueva-tarea', last_status: 'failed' }],
    };
    expect(opsIssues(extra)).toEqual(['nueva-tarea: falló la última corrida']);
  });
});
