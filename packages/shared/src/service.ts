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
  price_renegotiated: 'Precio reevaluado',
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
  // Precio reevaluado sigue siendo “en el domicilio”; Calificado cuenta como Confirmado.
  const step =
    status === 'price_renegotiated' ? 'at_home' : status === 'rated' ? 'confirmed' : status;
  return (SERVICE_STEPS as readonly JobStatus[]).indexOf(step);
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
  else if (status === 'at_home' || status === 'price_renegotiated') ms = 45000;
  else return null;
  if (battery !== null && battery < 0.1) return 60000;
  if (battery !== null && battery < 0.2) return Math.min(ms * 2, 60000);
  return ms;
}

export function isTrackingStatus(status: JobStatus): boolean {
  return status === 'on_the_way' || status === 'at_home' || status === 'price_renegotiated';
}

/** Solo dígitos, máximo 4: para el campo del código de seguridad. */
export function sanitizeSecurityCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, 4);
}

/**
 * A dónde va una posición recibida en segundo plano: al rastro del servicio (con servicio activo)
 * o a la presencia del pro en línea (solo la última posición, para reparto y antifraude).
 */
export function backgroundLocationTarget(
  mode: string | null,
  jobId: string | null,
): 'job' | 'presence' | null {
  if (mode === 'job' && jobId) return 'job';
  if (mode === 'presence') return 'presence';
  return null;
}

/** "Qué sigue" para el profesional en cada estado del servicio (una sola acción por vez). */
export function proNextStep(status: string): string | null {
  switch (status) {
    case 'accepted':
      return 'Cuando salgas, toca “Ir al domicilio”. El cliente verá en el mapa que vas en camino.';
    case 'on_the_way':
      return 'Al llegar, pídele al cliente su código de 4 dígitos y escríbelo abajo.';
    case 'at_home':
      return 'Toma una foto de antes, haz el trabajo y toma una de después. Si el precio cambia, usa “Reevaluar en sitio”. Al acabar, toca “Terminado”.';
    case 'price_renegotiated':
      return 'El cliente aprobó el nuevo precio. Termina el trabajo y toca “Terminado”.';
    case 'finished':
      return 'Cóbrale al cliente en efectivo, Yape o Plin. Cuando confirme el monto, se anota tu comisión.';
    case 'confirmed':
      return 'Califica al cliente. La comisión de este trabajo ya está en “Mi comisión”.';
    case 'rated':
    case 'cancelled':
      return 'Vuelve a Solicitudes para ver más pedidos cerca de ti.';
    default:
      return null;
  }
}

/** Mensaje al pro cuando el código de llegada no coincide (el servidor bloquea tras varios intentos). */
export function arrivalCodeMessage(
  attempts: number,
  lockedUntil: string | null,
  maxAttempts: number,
): string {
  if (lockedUntil) {
    const d = new Date(new Date(lockedUntil).getTime() - 5 * 3_600_000);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `El código no coincide. Por seguridad quedó bloqueado hasta las ${hh}:${mm}. Pídele al cliente que te lo dicte en persona.`;
  }
  const left = Math.max(0, maxAttempts - attempts);
  return `El código no coincide. Pídeselo al cliente. ${left === 1 ? 'Te queda 1 intento.' : `Te quedan ${left} intentos.`}`;
}
