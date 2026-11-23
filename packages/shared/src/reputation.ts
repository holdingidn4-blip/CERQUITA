import { escapeHtml, formatLimaDateTime } from './quote';

/** Niveles del profesional (los calcula el servidor: `private.pro_level`). */
export type ProLevelSlug = 'nuevo' | 'verificado' | 'confianza' | 'destacado';

export const PRO_LEVELS: Record<ProLevelSlug, { label: string; hint: string }> = {
  nuevo: { label: 'Nuevo', hint: 'Identidad verificada, recién empieza en Cerquita.' },
  verificado: { label: 'Verificado', hint: 'Ya hizo sus primeros trabajos confirmados en la app.' },
  confianza: {
    label: 'De confianza',
    hint: 'Muchos trabajos confirmados y ninguna queja confirmada.',
  },
  destacado: {
    label: 'Destacado',
    hint: 'De los mejores: muchos trabajos, sin quejas y calificación alta.',
  },
};

export function levelLabel(level: string | null | undefined): string {
  return PRO_LEVELS[(level ?? 'nuevo') as ProLevelSlug]?.label ?? 'Nuevo';
}

/** Texto fijo del canje: no se promete dinero, vales ni sorteos. */
export const POINTS_REDEEM_NOTE =
  'Canje de premios: próximamente. Por ahora tus puntos suben tu nivel y te dan prioridad en las ofertas.';

/** El QR de asistencia lleva este prefijo y el código de 8 caracteres. */
export const TRAINING_QR_PREFIX = 'cerquita:capacitacion:';
const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;

/** Código limpio (igual que el servidor): sin el prefijo del QR, sin espacios ni guiones, en mayúsculas. */
export function normalizeTrainingCode(raw: string): string {
  return raw
    .trim()
    .replace(/^cerquita:capacitacion:/i, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

export function isTrainingCode(raw: string): boolean {
  return CODE_RE.test(normalizeTrainingCode(raw));
}

export type QuizQuestion = { q: string; options: string[]; answer: number };

/**
 * Cuestionario escrito en el panel, una pregunta por línea:
 * `¿Pregunta? | opción | *opción correcta | opción`. Devuelve las preguntas o el primer error.
 */
export function parseQuizText(
  text: string,
): { ok: true; quiz: QuizQuestion[] } | { ok: false; error: string } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { ok: false, error: 'Escribe al menos una pregunta.' };
  if (lines.length > 20) return { ok: false, error: 'Máximo 20 preguntas.' };
  const quiz: QuizQuestion[] = [];
  for (const [i, line] of lines.entries()) {
    const [q = '', ...raw] = line.split('|').map((p) => p.trim());
    const n = i + 1;
    if (q.length < 3) return { ok: false, error: `Pregunta ${n}: falta el texto.` };
    if (raw.length < 2 || raw.length > 6)
      return { ok: false, error: `Pregunta ${n}: pon de 2 a 6 opciones separadas por "|".` };
    const marked = raw.filter((o) => o.startsWith('*')).length;
    if (marked !== 1)
      return { ok: false, error: `Pregunta ${n}: marca con * una sola opción correcta.` };
    const options = raw.map((o) => o.replace(/^\*/, '').trim());
    if (options.some((o) => o.length === 0))
      return { ok: false, error: `Pregunta ${n}: hay una opción vacía.` };
    quiz.push({ q, options, answer: raw.findIndex((o) => o.startsWith('*')) });
  }
  return { ok: true, quiz };
}

export type Certificate = {
  certificate_no: string;
  pro_name: string | null;
  title: string;
  trade_name: string | null;
  city_slug: string;
  starts_at: string;
  passed_at: string;
  score: number;
  points: number;
};

/** HTML del certificado que la app convierte en PDF. */
export function certificateHtml(c: Certificate): string {
  const city = c.city_slug.charAt(0).toUpperCase() + c.city_slug.slice(1);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Certificado ${escapeHtml(c.certificate_no)}</title>
<style>body{font-family:Helvetica,Arial,sans-serif;color:#17231F;padding:40px;text-align:center}
.box{border:3px solid #0E5A4B;border-radius:16px;padding:36px}h1{color:#0E5A4B;margin:0 0 8px}
.name{font-size:26px;font-weight:700;margin:18px 0}.muted{color:#5B6B65;font-size:13px}</style></head><body>
<div class="box"><p class="muted">Cerquita · Capacitación para profesionales</p>
<h1>Certificado de participación</h1><p>Se certifica que</p>
<p class="name">${escapeHtml(c.pro_name ?? 'Profesional de Cerquita')}</p>
<p>participó y aprobó la charla <strong>${escapeHtml(c.title)}</strong>${c.trade_name ? ` (${escapeHtml(c.trade_name)})` : ''}
en ${escapeHtml(city)} el ${formatLimaDateTime(c.starts_at).slice(0, 10)}, con ${c.score} % en el cuestionario.</p>
<p class="muted">N.° ${escapeHtml(c.certificate_no)} · aprobado el ${formatLimaDateTime(c.passed_at)} · ${c.points} puntos Cerquita</p>
<p class="muted">Cerquita es una plataforma intermediaria. Este certificado acredita la asistencia a una charla; no es un título profesional.</p>
</div></body></html>`;
}
