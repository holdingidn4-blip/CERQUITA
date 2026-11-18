import { formatSchedule } from './prelaunch';

/** Minutos que el profesional puede ofrecer para llegar (pedidos para "ahora"). */
export const ETA_OPTIONS = [15, 30, 45, 60, 90] as const;

const MINUTE = 60_000;

export type ArrivalState =
  | { kind: 'none' }
  | { kind: 'on_time'; minutesLeft: number }
  /** Pasó la hora acordada, pero sigue dentro de la tolerancia. */
  | { kind: 'late'; minutesLate: number }
  /** Pasó la tolerancia: el cliente puede cambiar de profesional. */
  | { kind: 'can_switch'; minutesLate: number };

/**
 * Estado de la llegada acordada. La tolerancia viene de settings (`no_show_grace_minutes`);
 * el servidor aplica la misma regla en `report_no_show`.
 */
export function arrivalState(
  promisedAt: string | Date | null,
  graceMinutes: number,
  now: Date = new Date(),
): ArrivalState {
  if (!promisedAt) return { kind: 'none' };
  const diff = now.getTime() - new Date(promisedAt).getTime();
  if (diff < 0) return { kind: 'on_time', minutesLeft: Math.ceil(-diff / MINUTE) };
  const minutesLate = Math.floor(diff / MINUTE);
  return diff >= graceMinutes * MINUTE
    ? { kind: 'can_switch', minutesLate }
    : { kind: 'late', minutesLate };
}

/** "10:45" si es hoy (hora de Lima); si no, "mar 12 nov, 10:45". */
export function formatArrival(promisedAt: string | Date, now: Date = new Date()): string {
  const full = formatSchedule(promisedAt, 'scheduled');
  const day = (s: string) => s.slice(0, s.lastIndexOf(','));
  return day(full) === day(formatSchedule(now, 'scheduled'))
    ? full.slice(full.lastIndexOf(',') + 2)
    : full;
}
