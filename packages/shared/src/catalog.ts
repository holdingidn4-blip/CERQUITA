/** Catálogo de trabajos por oficio: búsqueda sin tildes y estados de cada trabajo del profesional. */

export type CatalogItem = { name: string; searchTerms?: string };

/** Minúsculas, sin tildes ni signos: "Tuberías" y "tuberias" son lo mismo. */
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Filtra por nombre y palabras de búsqueda. Cada palabra escrita debe ser el comienzo de alguna palabra
 * del trabajo (en cualquier orden): "fuga caño" encuentra "Fugas de agua", pero "gas" no encuentra
 * "fugas". Sin texto, devuelve la lista completa.
 */
export function filterCatalog<T extends CatalogItem>(items: T[], query: string): T[] {
  const words = normalizeSearch(query).split(' ').filter(Boolean);
  if (words.length === 0) return items;
  return items.filter((item) => {
    const own = normalizeSearch(`${item.name} ${item.searchTerms ?? ''}`).split(' ');
    return words.every((w) => own.some((o) => o.startsWith(w)));
  });
}

/** included = sigue al oficio · pending/approved/rejected = trabajo de riesgo revisado aparte. */
export type ProSpecialtyStatus = 'included' | 'pending' | 'approved' | 'rejected';

export const PRO_SPECIALTY_STATUS_LABELS: Record<ProSpecialtyStatus, string> = {
  included: 'Incluido en el oficio',
  pending: 'En revisión aparte',
  approved: 'Aprobado',
  rejected: 'No aprobado',
};

export type SpecialtyRequestStatus = 'pending' | 'approved' | 'rejected';

export const SPECIALTY_REQUEST_LABELS: Record<SpecialtyRequestStatus, string> = {
  pending: 'Pendiente de revisión',
  approved: 'Agregado al catálogo',
  rejected: 'No agregado',
};

/** Igual que request_specialty(): de 3 a 60 letras. */
export function customSpecialtyError(text: string): string | null {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length < 3) return 'Describe el trabajo con al menos 3 letras.';
  if (clean.length > 60) return 'Máximo 60 letras.';
  return null;
}
