import { describe, expect, it } from 'vitest';
import {
  ageOn,
  firstIncompleteStep,
  formatClock,
  isAdult,
  isValidDni,
  normalizeDni,
  ONBOARDING_STEPS,
  parseBirthDate,
  stepOfRequirement,
} from './onboarding';
import { describeMissing } from './verification';

const done = {
  hasName: true,
  hasIdentityData: true,
  idPhotosDone: true,
  tradesCount: 1,
  missingByTrade: [] as string[][],
  hasBackground: true,
  radiusSet: true,
};

describe('asistente de registro', () => {
  it('tiene 6 pasos con su "por qué"', () => {
    expect(ONBOARDING_STEPS.map((s) => s.key)).toEqual([
      'datos',
      'oficios',
      'pruebas',
      'antecedentes',
      'zona',
      'revision',
    ]);
    for (const step of ONBOARDING_STEPS) expect(step.why.length).toBeGreaterThan(20);
  });
  it.each([
    ['identity_data', 'datos'],
    ['selfie', 'datos'],
    ['specialty', 'oficios'],
    ['work_photo', 'pruebas'],
    ['verification_video', 'pruebas'],
    ['driver_license', 'pruebas'],
    ['background', 'antecedentes'],
  ])('%s se completa en %s', (item, step) => expect(stepOfRequirement(item)).toBe(step));
  it('retoma en el primer paso incompleto', () => {
    expect(firstIncompleteStep({ ...done, hasIdentityData: false })).toBe(0);
    expect(firstIncompleteStep({ ...done, tradesCount: 0 })).toBe(1);
    expect(firstIncompleteStep({ ...done, missingByTrade: [['specialty', 'work_photo']] })).toBe(1);
    expect(firstIncompleteStep({ ...done, missingByTrade: [[], ['verification_video']] })).toBe(2);
    expect(firstIncompleteStep({ ...done, hasBackground: false })).toBe(3);
    expect(firstIncompleteStep({ ...done, radiusSet: false })).toBe(4);
    expect(firstIncompleteStep(done)).toBe(5);
  });
});

describe('DNI y edad', () => {
  it('el DNI queda en 8 números', () => {
    expect(normalizeDni('45 678-901x9')).toBe('45678901');
    expect(isValidDni('4567890')).toBe(false);
    expect(isValidDni('45678901')).toBe(true);
  });
  it('lee la fecha de nacimiento', () => {
    expect(parseBirthDate('7', '3', '1990')).toEqual({ iso: '1990-03-07' });
    expect(parseBirthDate('31', '2', '1990')).toHaveProperty('error');
    expect(parseBirthDate('aa', '2', '1990')).toHaveProperty('error');
    expect(parseBirthDate('1', '1', '1899')).toHaveProperty('error');
  });
  it('mayor de 18 cuenta el cumpleaños', () => {
    const today = new Date(2026, 10, 23);
    expect(ageOn('2008-11-23', today)).toBe(18);
    expect(isAdult('2008-11-23', today)).toBe(true);
    expect(isAdult('2008-11-24', today)).toBe(false);
  });
});

describe('describeMissing', () => {
  it('traduce los faltantes con sus mínimos', () => {
    const mins: Record<string, number> = { work_photo: 3, reference: 2 };
    expect(
      describeMissing(
        [
          'identity_data',
          'specialty',
          'work_photo',
          'reference',
          'verification_video',
          'background',
        ],
        (item) => mins[item],
      ),
    ).toEqual([
      'Tu número de DNI y fecha de nacimiento',
      'Qué trabajos haces (especialidad)',
      '3 fotos de tus trabajos',
      '2 referencias',
      'Video de 1 a 3 minutos',
      'Certificado de antecedentes penales',
    ]);
  });
});

describe('formatClock', () => {
  it('minutos y segundos', () => {
    expect(formatClock(75)).toBe('1:15');
    expect(formatClock(180)).toBe('3:00');
  });
});
