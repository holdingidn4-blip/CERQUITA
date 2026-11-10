import { describe, expect, it } from 'vitest';
import {
  isTrackingStatus,
  sanitizeSecurityCode,
  serviceStepIndex,
  trackingIntervalMs,
} from './service';

describe('trackingIntervalMs', () => {
  it('en camino: 8 s, y 4 s a menos de 200 m', () => {
    expect(trackingIntervalMs('on_the_way', 900, 1)).toBe(8000);
    expect(trackingIntervalMs('on_the_way', 150, 1)).toBe(4000);
    expect(trackingIntervalMs('on_the_way', null, null)).toBe(8000);
  });
  it('en el domicilio: 45 s', () => expect(trackingIntervalMs('at_home', 0, 0.9)).toBe(45000));
  it('batería baja duplica; muy baja, cada 60 s', () => {
    expect(trackingIntervalMs('on_the_way', 900, 0.15)).toBe(16000);
    expect(trackingIntervalMs('at_home', 0, 0.15)).toBe(60000);
    expect(trackingIntervalMs('on_the_way', 900, 0.05)).toBe(60000);
  });
  it('fuera de En camino / En el domicilio no se comparte (regla 5)', () => {
    for (const s of ['accepted', 'finished', 'confirmed', 'cancelled', 'published'] as const) {
      expect(trackingIntervalMs(s, 100, 1)).toBeNull();
      expect(isTrackingStatus(s)).toBe(false);
    }
  });
});

describe('utilidades', () => {
  it('orden de pasos', () => {
    expect(serviceStepIndex('accepted')).toBe(0);
    expect(serviceStepIndex('confirmed')).toBe(4);
    expect(serviceStepIndex('cancelled')).toBe(-1);
  });
  it('código de seguridad', () => {
    expect(sanitizeSecurityCode('12a3-45')).toBe('1234');
  });
});
