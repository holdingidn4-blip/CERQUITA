/** Números de emergencia de Perú. TODO(decidir): verificarlos antes de publicar (documento técnico). */
export const EMERGENCY_NUMBERS = [
  { number: '105', label: 'Policía' },
  { number: '116', label: 'Bomberos' },
  { number: '106', label: 'SAMU' },
] as const;

export const SOS_HOLD_MS = 2000;
export const SOS_COUNTDOWN_S = 5;
export const SOS_SHARE_EVERY_MS = 10000;

export function mapsLink(latitude: number, longitude: number): string {
  return `https://maps.google.com/?q=${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

/** Mensaje para los contactos de confianza (SMS o WhatsApp). */
export function sosMessage(
  name: string | null,
  point: { latitude: number; longitude: number } | null,
  service?: string,
): string {
  const who = name?.trim() || 'Tu contacto';
  const where = point ? ` Mi ubicación: ${mapsLink(point.latitude, point.longitude)}` : '';
  const what = service ? ` Estoy en un servicio de Cerquita (${service}).` : '';
  return `SOS: ${who} necesita ayuda.${what}${where}`;
}

/** Enlace sms: con varios destinatarios (Android usa coma; iOS acepta el mismo formato con &body). */
export function smsLink(
  phones: string[],
  body: string,
  platform: 'ios' | 'android' | 'web' = 'android',
): string {
  const to = phones.map((p) => `+${p.replace(/^\+/, '')}`).join(',');
  return `sms:${to}${platform === 'ios' ? '&' : '?'}body=${encodeURIComponent(body)}`;
}

export function whatsappLink(phone: string, body: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(body)}`;
}
