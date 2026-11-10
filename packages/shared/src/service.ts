import type { JobStatus } from './domain';

/** Pasos visibles del servicio (pantallas 5 y 10). */
export const SERVICE_STEPS = [
  'accepted',
  'on_the_way',
  'at_home',
  'finished',
  'confirmed',
] as const satisfies readonly JobStatus[];

export const SERVICE_LABELS: Record<JobStatus, string> = {
  published: 'Publicado',
  with_offers: 'Con ofertas',
  accepted: 'Aceptado',
  on_the_way: 'En camino',
  at_home: 'En el domicilio',
  finished: 'Terminado',
  confirmed: 'Confirmado',
  rated: 'Calificado',
  cancelled: 'Cancelado',
};

/** Estados en los que el pedido sigue vivo después de aceptar. */
export const ACTIVE_SERVICE_STATUSES: readonly JobStatus[] = [
  'accepted',
  'on_the_way',
  'at_home',
  'finished',
];

export function serviceStepIndex(status: JobStatus): number {
  return (SERVICE_STEPS as readonly JobStatus[]).indexOf(status);
}

/**
 * Intervalo de envío de ubicación (documento técnico, “Ubicación, seguridad y privacidad”):
 * en camino 8 s, 4 s a menos de 200 m; en el domicilio 45 s; nada en otros estados.
 * Batería bajo 20 %: el doble. Bajo 10 %: cada 60 s.
 */
export function trackingIntervalMs(
  status: JobStatus,
  distanceM: number | null,
  battery: number | null,
): number | null {
  let ms: number;
  if (status === 'on_the_way') ms = distanceM !== null && distanceM < 200 ? 4000 : 8000;
  else if (status === 'at_home') ms = 45000;
  else return null;
  if (battery !== null && battery < 0.1) return 60000;
  if (battery !== null && battery < 0.2) return Math.min(ms * 2, 60000);
  return ms;
}

export function isTrackingStatus(status: JobStatus): boolean {
  return status === 'on_the_way' || status === 'at_home';
}

/** Solo dígitos, máximo 4: para el campo del código de seguridad. */
export function sanitizeSecurityCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, 4);
}
