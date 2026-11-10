import type { Role } from './domain';

/** Roles de soporte en `app_metadata.staff_role` (solo los fija el servidor). */
export const STAFF_ROLES = ['reviewer', 'support', 'admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const OTP_LENGTH = 6;
/** Segundos antes de permitir reenviar el código. */
export const OTP_RESEND_SECONDS = 60;

/**
 * Normaliza un celular peruano a E.164 (+519XXXXXXXX).
 * Acepta "987 654 321", "987-654-321", "51987654321" y "+51 987 654 321".
 */
export function normalizePeruMobile(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, '');
  const match = /^(?:\+?51)?(9\d{8})$/.exec(digits);
  return match ? `+51${match[1]}` : null;
}

/** "+51987654452" o "51987654452" → "+51 9** *** 452" */
export function maskPhone(phone: string | null | undefined): string {
  const match = /^\+?51(9)\d{5}(\d{3})$/.exec(phone ?? '');
  return match ? `+51 ${match[1]}** *** ${match[2]}` : '';
}

export function isValidOtp(code: string): boolean {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code);
}

export function staffRoleFrom(appMetadata: unknown): StaffRole | null {
  if (typeof appMetadata !== 'object' || appMetadata === null) return null;
  const value = (appMetadata as Record<string, unknown>).staff_role;
  return STAFF_ROLES.find((role) => role === value) ?? null;
}

/** A dónde va el usuario después de ingresar o al cambiar de modo. */
export function homeRouteFor(
  role: Role,
  hasProTrades: boolean,
): '/inicio' | '/solicitudes' | '/registro' {
  if (role === 'client') return '/inicio';
  return hasProTrades ? '/solicitudes' : '/registro';
}

/** "Rosa Vargas" → "RV" */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
