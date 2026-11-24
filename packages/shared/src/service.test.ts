import { describe, expect, it } from 'vitest';
import {
  arrivalCodeMessage,
  proNextStep,
  backgroundLocationTarget,
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

describe('posición en segundo plano', () => {
  it('con servicio activo va al rastro del servicio', () => {
    expect(backgroundLocationTarget('job', 'abc')).toBe('job');
  });
  it('en línea sin servicio va a la presencia (antes no se enviaba)', () => {
    expect(backgroundLocationTarget('presence', null)).toBe('presence');
  });
  it('sin modo o con el servicio ya cerrado no se envía', () => {
    expect(backgroundLocationTarget(null, null)).toBeNull();
    expect(backgroundLocationTarget('job', null)).toBeNull();
  });
});

describe('proNextStep', () => {
  it('dice una sola acción por estado', () => {
    expect(proNextStep('accepted')).toContain('Ir al domicilio');
    expect(proNextStep('on_the_way')).toContain('código de 4 dígitos');
    expect(proNextStep('finished')).toContain('Cóbrale');
    expect(proNextStep('published')).toBeNull();
  });
});

describe('código de llegada equivocado', () => {
  it('dice cuántos intentos quedan', () => {
    expect(arrivalCodeMessage(1, null, 3)).toBe(
      'El código no coincide. Pídeselo al cliente. Te quedan 2 intentos.',
    );
    expect(arrivalCodeMessage(2, null, 3)).toMatch(/Te queda 1 intento\./);
  });
  it('con bloqueo, dice hasta qué hora (hora de Lima)', () => {
    expect(arrivalCodeMessage(3, '2026-11-24T15:10:00Z', 3)).toMatch(/bloqueado hasta las 10:10/);
  });
});
