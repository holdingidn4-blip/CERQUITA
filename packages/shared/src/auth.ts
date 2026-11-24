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

/**
 * Lo que escribe la persona en el campo de celular: solo dígitos (sin +51), máximo 9, agrupados
 * "9XX XXX XXX". `hint` explica en palabras simples qué falta; null cuando el número es válido.
 */
export function formatPeruMobileInput(raw: string): {
  digits: string;
  display: string;
  valid: boolean;
  hint: string | null;
} {
  let digits = raw.replace(/\D/g, '');
  if (digits.length > 9 && digits.startsWith('51')) digits = digits.slice(2);
  digits = digits.slice(0, 9);
  const display = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)]
    .filter(Boolean)
    .join(' ');
  const valid = /^9\d{8}$/.test(digits);
  let hint: string | null = null;
  if (digits.length > 0 && !digits.startsWith('9')) hint = 'Los celulares en Perú empiezan con 9.';
  else if (digits.length > 0 && !valid) {
    const left = 9 - digits.length;
    hint = left === 1 ? 'Falta 1 dígito.' : `Faltan ${left} dígitos.`;
  }
  return { digits, display, valid, hint };
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
