import type { ProTradeStatus, VerificationDocumentKind } from './domain';

/** Documentos de identidad que se piden una sola vez (no dependen del oficio). */
export const IDENTITY_KINDS = [
  'dni_front',
  'dni_back',
  'selfie',
  'background',
] as const satisfies readonly VerificationDocumentKind[];
export type IdentityKind = (typeof IDENTITY_KINDS)[number];

/** Evidencia por oficio. */
export const EVIDENCE_KINDS = [
  'work_photo',
  'certificate',
  'reference',
  'quiz',
] as const satisfies readonly VerificationDocumentKind[];

export const DOCUMENT_LABELS: Record<VerificationDocumentKind, string> = {
  dni_front: 'DNI (frente)',
  dni_back: 'DNI (reverso)',
  selfie: 'Selfie sosteniendo tu DNI',
  background: 'Certificado de antecedentes',
  work_photo: 'Foto de un trabajo',
  certificate: 'Certificado del oficio',
  reference: 'Referencia',
  quiz: 'Prueba corta',
};

export type Tone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

export type ProTradeView = {
  label: string;
  tone: Tone;
  description: string;
  canAddEvidence: boolean;
};

type ViewInput = {
  status: ProTradeStatus;
  tradeName: string;
  ratingsForFull: number;
  reason: string | null;
};

/** Texto y color de cada estado para la pantalla 12 y el panel. */
export function proTradeView({
  status,
  tradeName,
  ratingsForFull,
  reason,
}: ViewInput): ProTradeView {
  const trade = tradeName.toLowerCase();
  switch (status) {
    case 'draft':
      return {
        label: 'Borrador',
        tone: 'neutral',
        description:
          'Completa tu identidad y sube al menos dos pruebas de tu oficio para enviarlo.',
        canAddEvidence: true,
      };
    case 'submitted':
      return {
        label: 'Enviado',
        tone: 'info',
        description: 'Recibimos tu evidencia. Un revisor del rubro la mirará pronto.',
        canAddEvidence: false,
      };
    case 'in_review':
      return {
        label: 'En revisión',
        tone: 'info',
        description:
          'Un revisor del rubro está mirando tus fotos y tu certificado. Te avisaremos aquí cuando termine.',
        canAddEvidence: false,
      };
    case 'needs_info':
      return {
        label: 'Falta información',
        tone: 'warning',
        description: reason
          ? `Motivo del revisor: “${reason}”`
          : 'El revisor necesita más evidencia.',
        canAddEvidence: true,
      };
    case 'approved_observation':
      // TODO(decidir): precio máximo de un trabajo “en observación” (pantalla 12).
      return {
        label: 'En observación',
        tone: 'success',
        description: `Ya recibes pedidos de ${trade}. Con ${ratingsForFull} calificaciones de 4 estrellas o más pasas a aprobado pleno.`,
        canAddEvidence: false,
      };
    case 'approved_full':
      return {
        label: 'Aprobado',
        tone: 'success',
        description: `Recibes pedidos de ${trade} con la insignia “Verificado”.`,
        canAddEvidence: false,
      };
    case 'rejected':
      return {
        label: 'Rechazado',
        tone: 'danger',
        description: reason
          ? `Motivo del revisor: “${reason}”. Podrás reintentar en 30 días.`
          : 'Podrás reintentar en 30 días.',
        canAddEvidence: false,
      };
    case 'suspended':
      return {
        label: 'Suspendido',
        tone: 'danger',
        description: 'Este oficio está suspendido. Escribe a soporte si crees que es un error.',
        canAddEvidence: false,
      };
  }
}

/** "1 de 3" para el contador de calificaciones en observación. */
export function observationProgress(goodRatings: number, ratingsForFull: number): string {
  return `${Math.min(goodRatings, ratingsForFull)} de ${ratingsForFull}`;
}

/** Convierte la respuesta de pro_trade_missing() en textos para el usuario. */
export function describeMissing(missing: readonly string[], minEvidence: number): string[] {
  return missing.map((item) =>
    item === 'evidence'
      ? `Al menos ${minEvidence} pruebas de tu oficio`
      : (DOCUMENT_LABELS[item as VerificationDocumentKind] ?? item),
  );
}

/** Ruta en el bucket privado: siempre dentro de la carpeta del profesional. */
export function verificationPath(
  proId: string,
  kind: VerificationDocumentKind,
  fileId: string,
  extension: string,
): string {
  const ext = extension.replace(/^\./, '').toLowerCase();
  if (!/^(jpg|jpeg|png|webp|pdf)$/.test(ext))
    throw new Error(`Tipo de archivo no permitido: ${ext}`);
  return `${proId}/${kind}-${fileId}.${ext}`;
}

/** Lista de km que puede elegir el profesional como zona de trabajo. */
export const RADIUS_OPTIONS_KM = [1, 3, 5, 10] as const;
