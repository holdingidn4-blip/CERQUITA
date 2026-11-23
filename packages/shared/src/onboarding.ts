/** Asistente de registro del profesional (F2): 6 pasos cortos, un objetivo por pantalla. */
export const ONBOARDING_STEPS = [
  {
    key: 'datos',
    title: 'Tus datos y DNI',
    goal: 'Cuéntanos quién eres',
    why: 'Así los clientes saben que eres una persona real. Tu DNI no se muestra a nadie: solo lo ve el equipo que verifica.',
  },
  {
    key: 'oficios',
    title: 'Tus oficios',
    goal: 'Elige qué trabajos haces',
    why: 'Solo te llegan pedidos de los oficios que elijas y aprobemos. Las especialidades ayudan a que te lleguen los trabajos que sí sabes hacer.',
  },
  {
    key: 'pruebas',
    title: 'Pruebas de tu trabajo',
    goal: 'Muestra cómo trabajas',
    why: 'Los clientes confían en quien muestra su trabajo. Según el oficio pedimos fotos, un certificado o referencias, y un video corto donde te presentas.',
  },
  {
    key: 'antecedentes',
    title: 'Antecedentes',
    goal: 'Sube tu certificado de antecedentes penales',
    why: 'Vas a entrar a casas de familias. Solo guardamos si eres apto para el oficio, no el detalle del certificado, y lo borramos después de revisarlo.',
  },
  {
    key: 'zona',
    title: 'Zona de trabajo',
    goal: '¿Hasta dónde puedes ir?',
    why: 'Te mostramos pedidos cerca de ti para que llegues rápido. Puedes cambiarla cuando quieras.',
  },
  {
    key: 'revision',
    title: 'Revisa y envía',
    goal: 'Revisa que todo esté listo',
    why: 'Un revisor mira todo en menos de 24 horas. Te avisamos qué oficios se aprobaron y si falta algo.',
  },
] as const;
export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]['key'];

const IDENTITY_ITEMS = ['identity_data', 'dni_front', 'dni_back', 'selfie'];

/** Paso del asistente donde se completa cada faltante que devuelve `pro_trade_missing()`. */
export function stepOfRequirement(item: string): OnboardingStepKey {
  if (IDENTITY_ITEMS.includes(item)) return 'datos';
  if (item === 'specialty') return 'oficios';
  if (item === 'background') return 'antecedentes';
  return 'pruebas';
}

export type OnboardingProgress = {
  hasName: boolean;
  hasIdentityData: boolean;
  idPhotosDone: boolean;
  tradesCount: number;
  /** Faltantes de cada oficio que aún se puede editar (borrador o con pedido de más pruebas). */
  missingByTrade: readonly (readonly string[])[];
  hasBackground: boolean;
  radiusSet: boolean;
};

/** Índice del primer paso incompleto: ahí se retoma el registro (autoguardado). */
export function firstIncompleteStep(p: OnboardingProgress): number {
  if (!p.hasName || !p.hasIdentityData || !p.idPhotosDone) return 0;
  const missing = p.missingByTrade.flat();
  if (p.tradesCount === 0 || missing.some((m) => stepOfRequirement(m) === 'oficios')) return 1;
  if (missing.some((m) => stepOfRequirement(m) === 'pruebas')) return 2;
  if (!p.hasBackground) return 3;
  if (!p.radiusSet) return 4;
  return 5;
}

/** Solo números; el DNI peruano tiene 8. */
export function normalizeDni(text: string): string {
  return text.replace(/\D/g, '').slice(0, 8);
}
export function isValidDni(text: string): boolean {
  return /^\d{8}$/.test(text);
}

/** Fecha de nacimiento escrita en tres casillas (día, mes, año) → `AAAA-MM-DD`. */
export function parseBirthDate(
  day: string,
  month: string,
  year: string,
): { iso: string } | { error: string } {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month) || !/^\d{4}$/.test(year)) {
    return { error: 'Escribe día, mes y año con números (ej. 07 / 03 / 1990).' };
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    y < 1900 ||
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return { error: 'Esa fecha no existe. Revísala.' };
  }
  return { iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

/** Edad cumplida a la fecha `today` (se usa el día calendario, sin horas). */
export function ageOn(isoBirth: string, today: Date): number {
  const [y, m, d] = isoBirth.split('-').map(Number) as [number, number, number];
  let age = today.getFullYear() - y;
  const before = today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d);
  if (before) age -= 1;
  return age;
}
export function isAdult(isoBirth: string, today: Date = new Date()): boolean {
  return ageOn(isoBirth, today) >= 18;
}

/** Nivel de riesgo del oficio (`trades.risk_level`) en palabras simples. */
export const RISK_LEVELS = ['high', 'trust', 'skill'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];
export const RISK_LABELS: Record<RiskLevel, string> = {
  high: 'Riesgo alto',
  trust: 'Confianza',
  skill: 'Habilidad',
};
export const RISK_HELP: Record<RiskLevel, string> = {
  high: 'Trabajo con luz, gas o cableado: pedimos fotos de tus trabajos y un certificado técnico.',
  trust: 'Entras a casas o cuidas personas: pedimos 2 referencias de gente que te conoce.',
  skill: 'Pedimos de 3 a 5 fotos de tus trabajos, cada una con una frase de qué hiciste.',
};

/** Resultado de antecedentes por oficio: solo esto se guarda, nunca el detalle. */
export const BACKGROUND_RESULTS = ['apto', 'con_restriccion', 'no_apto'] as const;
export type BackgroundResult = (typeof BACKGROUND_RESULTS)[number];
export const BACKGROUND_RESULT_LABELS: Record<BackgroundResult, string> = {
  apto: 'Apto',
  con_restriccion: 'Con restricción',
  no_apto: 'No apto',
};

/** Guion del video de verificación (1 a 3 minutos). */
export const VIDEO_PROMPTS = [
  'Di tu nombre y cuántos años tienes en el oficio.',
  'Muestra tus herramientas.',
  'Haz una tarea corta de tu oficio, por ejemplo ajustar un caño o lijar una tabla.',
] as const;

/** 75 → "1:15". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Ejemplos de foto buena y mala para la evidencia. */
export const PHOTO_TIPS = {
  good: [
    'Con buena luz, de día o con la luz prendida',
    'Se ve el trabajo completo',
    'Foto nítida, sin moverte',
  ],
  bad: ['Oscura o borrosa', 'Muy de cerca, no se entiende qué es', 'Fotos sacadas de internet'],
} as const;
