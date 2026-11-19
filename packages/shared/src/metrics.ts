import { formatMinutes } from './ledger';

/** Métricas del piloto (panel). Forma de lo que devuelve `pilot_metrics(p_days)`. */
export interface PilotDay {
  day: string;
  published: number;
  with_offer: number;
  hired: number;
  completed: number;
  cancelled: number;
  median_first_offer_min: number | null;
}
export interface PilotTotals extends Omit<PilotDay, 'day'> {
  p90_first_offer_min: number | null;
}
export interface PilotMetrics {
  days: number;
  from: string;
  to: string;
  totals: PilotTotals;
  daily: PilotDay[];
}

/** Ventanas que ofrece el panel (la base acepta de 1 a 90 días). */
export const METRIC_WINDOWS = [7, 14, 30, 90] as const;
export type MetricWindow = (typeof METRIC_WINDOWS)[number];

/** Lee `?dias=` de la URL; si no es una ventana ofrecida, 14 días. */
export function metricWindow(value: unknown): MetricWindow {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return (METRIC_WINDOWS as readonly number[]).includes(n) ? (n as MetricWindow) : 14;
}

/** Porcentaje entero de `part` sobre `total`; null si no hay base. */
export function shareOf(part: number, total: number): number | null {
  if (!(total > 0)) return null;
  return Math.round((part * 100) / total);
}

/** "43 %" o "—" si no hay base. */
export function formatShare(part: number, total: number): string {
  const share = shareOf(part, total);
  return share === null ? '—' : `${share} %`;
}

/** Minutos de una mediana: "menos de 1 min", "12 min", "1 h 5 min" o "—". */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return '—';
  if (minutes < 1) return 'menos de 1 min';
  return formatMinutes(Math.round(minutes));
}

/** Marcas enteras y limpias (1, 2, 5 × 10ⁿ) desde 0 hasta cubrir `max`, unas `target`. */
export function niceTicks(max: number, target = 4): number[] {
  const top = Math.max(1, Math.ceil(max));
  const raw = top / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(
    1,
    [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10,
  );
  const ticks: number[] = [];
  for (let t = 0; t < top + step; t += step) ticks.push(t);
  return ticks;
}

/** "2026-11-19" → "19/11". */
export function dayLabel(isoDate: string): string {
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}
