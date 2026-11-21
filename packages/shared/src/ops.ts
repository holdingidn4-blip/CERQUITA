/** Estado de la operación (panel → Sistema). Forma de lo que devuelve `ops_health()`. */
export interface CronJobHealth {
  name: string;
  schedule: string;
  active: boolean;
  last_start: string | null;
  last_end: string | null;
  last_status: string | null;
  last_message: string | null;
  runs_24h: number;
  failures_24h: number;
}
export interface OpsHealth {
  checked_at: string;
  cron: CronJobHealth[];
  outbox: {
    pending: number;
    stale: number;
    oldest_pending: string | null;
    sent_24h: number;
    failed_24h: number;
    skipped_24h: number;
    last_sent: string | null;
    stale_minutes: number;
  };
  http: {
    total: number;
    ok: number;
    errors: number;
    last_error: { at: string; status: number | null; message: string | null } | null;
  };
}

/** Qué hace cada tarea programada, en palabras de soporte. */
export const CRON_JOB_LABELS: Record<string, string> = {
  'dispatch-push': 'Envío de notificaciones (cada minuto)',
  'detect-bypass': 'Detección de tratos por fuera (cada 5 min)',
  'storage-cleanup': 'Limpieza de archivos huérfanos (cada hora)',
  'schedule-reminders': 'Recordatorios de pedidos programados (cada 5 min)',
  'purge-job-tracks': 'Borrado del rastro GPS de más de 30 días (diario)',
  'purge-outbox': 'Limpieza de notificaciones de más de 30 días (diario)',
};

export type CronState = 'ok' | 'failed' | 'running' | 'never' | 'paused';
export const CRON_STATE_LABELS: Record<CronState, string> = {
  ok: 'Bien',
  failed: 'Falló',
  running: 'Corriendo',
  never: 'Aún no corre',
  paused: 'Pausada',
};

export function cronState(job: Pick<CronJobHealth, 'active' | 'last_status'>): CronState {
  if (!job.active) return 'paused';
  if (job.last_status === null) return 'never';
  if (job.last_status === 'failed') return 'failed';
  if (job.last_status === 'succeeded') return 'ok';
  return 'running';
}

/** Avisos para soporte: tareas que fallaron o están pausadas, notificaciones atascadas y errores HTTP. */
export function opsIssues(health: OpsHealth): string[] {
  const issues: string[] = [];
  for (const job of health.cron) {
    const label = CRON_JOB_LABELS[job.name] ?? job.name;
    const state = cronState(job);
    if (state === 'failed') issues.push(`${label}: falló la última corrida`);
    if (state === 'paused') issues.push(`${label}: está pausada`);
  }
  const { stale, stale_minutes } = health.outbox;
  if (stale > 0) {
    issues.push(
      `${stale} ${stale === 1 ? 'notificación lleva' : 'notificaciones llevan'} más de ${stale_minutes} min en cola`,
    );
  }
  if (health.http.errors > 0) {
    issues.push(
      `${health.http.errors} ${health.http.errors === 1 ? 'llamada saliente falló' : 'llamadas salientes fallaron'} en las últimas horas`,
    );
  }
  return issues;
}
