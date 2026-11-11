import type { Cents } from './money';

export type ChatViolation = 'phone' | 'email' | 'keyword';

/**
 * Mismo criterio que private.chat_violation() en la base (el servidor es quien bloquea;
 * la app lo usa para avisar antes de enviar). Bloquea teléfonos, correos y palabras clave.
 */
export function chatViolation(body: string): ChatViolation | null {
  const lower = body.toLowerCase();
  const digits = body.replace(/[\s.\-()/+]/g, '');
  if (/\d{7,}/.test(digits)) return 'phone';
  if (
    /[a-z0-9._%+-]+\s*(@|\(at\)|\[at\]| arroba )\s*[a-z0-9.-]+\s*(\.|punto)\s*[a-z]{2,}/.test(lower)
  )
    return 'email';
  if (
    /(whats\s*app|whatsapp|wasap|wassap|guasap|\bwsp\b|\bwpp\b|\bwa\.me|telegram|\btelegrama\b|signal|messenger|facebook|instagram|\big\b:|ll[aá]ma(me)?\s+al|escr[ií]beme\s+al|mi\s+(n[uú]mero|cel|celular|correo|telf?|tel[eé]fono)|p[aá]game\s+(por\s+)?(fuera|aparte|directo)|sin\s+la\s+app|fuera\s+de\s+la\s+app)/.test(
      lower,
    )
  )
    return 'keyword';
  return null;
}

export const CHAT_BLOCK_MESSAGES: Record<ChatViolation, string> = {
  phone:
    'Por tu seguridad no se pueden compartir números de teléfono. Coordinen todo por este chat.',
  email: 'Por tu seguridad no se pueden compartir correos. Coordinen todo por este chat.',
  keyword:
    'Mantén la conversación dentro de Cerquita: los acuerdos y pagos fuera de la app pierden el Seguro Cerquita y la Garantía por 30 días.',
};

/** Aviso del diagnóstico exprés por video. */
export const TEMP_VIDEO_NOTICE = '⏱️ Video temporal: expira en 48 hrs';
export const MAX_VIDEO_SECONDS = 15;

/** Horas que faltan para que venza un archivo temporal (0 si ya venció). */
export function hoursLeft(expiresAt: string | Date | null, now: Date = new Date()): number {
  if (!expiresAt) return 0;
  const ms = new Date(expiresAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 3_600_000));
}

/** Puntos Cerquita: cuánto descuento se puede aplicar (mismo tope que apply_points()). */
export function pointsDiscount(
  requestedPoints: number,
  available: number,
  laborCents: Cents,
  pointValueCents: number,
  maxPct: number,
): { points: number; discountCents: Cents } {
  const maxCents = Math.floor((laborCents * maxPct) / 100);
  const points = Math.max(
    0,
    Math.min(
      Math.floor(requestedPoints),
      available,
      Math.floor(maxCents / Math.max(pointValueCents, 1)),
    ),
  );
  return { points, discountCents: points * pointValueCents };
}

/** Puntos que gana el cliente al confirmar (por cada S/ 1 de mano de obra). */
export function pointsEarned(laborCents: Cents, pointsPerSol: number): number {
  return Math.floor(laborCents / 100) * pointsPerSol;
}

export type ProLevel = { name: 'Nuevo' | 'Bronce' | 'Plata' | 'Oro'; next: number | null };
/** Nivel del profesional según su puntaje de ranking. */
export function proLevel(score: number): ProLevel {
  if (score >= 600) return { name: 'Oro', next: null };
  if (score >= 250) return { name: 'Plata', next: 600 };
  if (score >= 80) return { name: 'Bronce', next: 250 };
  return { name: 'Nuevo', next: 80 };
}
