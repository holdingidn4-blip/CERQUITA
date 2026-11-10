import { describe, expect, it } from 'vitest';
import { mapsLink, smsLink, sosMessage, whatsappLink } from './sos';

describe('SOS', () => {
  it('mensaje con nombre, servicio y ubicación', () => {
    expect(sosMessage('Rosa Vargas', { latitude: -12.121, longitude: -77.031 }, 'Gasfitero')).toBe(
      'SOS: Rosa Vargas necesita ayuda. Estoy en un servicio de Cerquita (Gasfitero). Mi ubicación: https://maps.google.com/?q=-12.12100,-77.03100',
    );
    expect(sosMessage(null, null)).toBe('SOS: Tu contacto necesita ayuda.');
  });
  it('enlaces', () => {
    expect(mapsLink(-12.1, -77)).toBe('https://maps.google.com/?q=-12.10000,-77.00000');
    expect(smsLink(['51911', '+51922'], 'hola')).toBe('sms:+51911,+51922?body=hola');
    expect(smsLink(['51911'], 'a b', 'ios')).toBe('sms:+51911&body=a%20b');
    expect(whatsappLink('+51 911', 'hola')).toBe('https://wa.me/51911?text=hola');
  });
});
