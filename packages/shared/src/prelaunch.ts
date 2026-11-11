export type ScheduleKind = 'now' | 'later_today' | 'scheduled';
export const SCHEDULE_LABELS: Record<ScheduleKind, string> = {
  now: 'Ahora',
  later_today: 'Hoy más tarde',
  scheduled: 'Programado',
};

const LIMA_OFFSET_MS = -5 * 3_600_000; // Perú no usa horario de verano

/** Fecha y hora de Lima (UTC−5) como Date en UTC. */
export function limaDate(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - LIMA_OFFSET_MS);
}

function limaParts(d: Date) {
  const l = new Date(d.getTime() + LIMA_OFFSET_MS);
  return {
    y: l.getUTCFullYear(),
    m: l.getUTCMonth() + 1,
    d: l.getUTCDate(),
    h: l.getUTCHours(),
    min: l.getUTCMinutes(),
    dow: l.getUTCDay(),
  };
}

/** Horas para “Hoy más tarde”: de la próxima hora en punto (+1 h) hasta las 21:00 de hoy. */
export function laterTodayOptions(now: Date = new Date()): Date[] {
  const p = limaParts(now);
  const out: Date[] = [];
  for (let h = p.h + 2; h <= 21; h++) out.push(limaDate(p.y, p.m, p.d, h));
  return out;
}

/** Días para “Programado”: mañana y los 6 siguientes. */
export function scheduleDayOptions(now: Date = new Date()): { y: number; m: number; d: number }[] {
  const p = limaParts(now);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(Date.UTC(p.y, p.m - 1, p.d + i + 1));
    return { y: day.getUTCFullYear(), m: day.getUTCMonth() + 1, d: day.getUTCDate() };
  });
}

export const SCHEDULE_HOURS = [7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19] as const;

const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

/** "mar 12 nov, 10:00" en hora de Lima. */
export function formatSchedule(
  iso: string | Date | null,
  kind: ScheduleKind = 'scheduled',
): string {
  if (kind === 'now' || !iso) return 'Ahora';
  const p = limaParts(new Date(iso));
  const time = `${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`;
  return kind === 'later_today'
    ? `Hoy, ${time}`
    : `${DAYS[p.dow]} ${p.d} ${MONTHS[p.m - 1]}, ${time}`;
}

export const REPORT_REASONS = {
  harassment: 'Acoso o trato ofensivo',
  fraud: 'Fraude o estafa',
  off_app_payment: 'Pidió pagar o coordinar fuera de la app',
  inappropriate: 'Contenido inapropiado',
  safety: 'Me sentí en peligro',
  other: 'Otro',
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;

export const SUPPORT_CATEGORIES = {
  payment: 'Pagos y comisión',
  safety: 'Seguridad',
  account: 'Mi cuenta',
  claim: 'Reclamo por un servicio',
  app: 'Problema con la app',
  other: 'Otro',
} as const;
export type SupportCategory = keyof typeof SUPPORT_CATEGORIES;

export const TICKET_STATUS_LABELS = {
  open: 'Abierto',
  answered: 'Respondido',
  closed: 'Cerrado',
} as const;
