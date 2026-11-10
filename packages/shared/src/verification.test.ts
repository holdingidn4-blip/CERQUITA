import { describe, expect, it } from 'vitest';
import { PRO_TRADE_STATUSES } from './domain';
import {
  describeMissing,
  observationProgress,
  proTradeView,
  verificationPath,
} from './verification';

const base = { tradeName: 'Gasfitería', ratingsForFull: 3, reason: null };

describe('proTradeView', () => {
  it.each(PRO_TRADE_STATUSES)('tiene texto para %s', (status) => {
    const view = proTradeView({ ...base, status });
    expect(view.label).not.toBe('');
    expect(view.description).not.toBe('');
  });

  it('En observación explica cómo pasar a pleno', () => {
    expect(proTradeView({ ...base, status: 'approved_observation' }).description).toBe(
      'Ya recibes pedidos de gasfitería. Con 3 calificaciones de 4 estrellas o más pasas a aprobado pleno.',
    );
  });

  it('Falta información muestra el motivo y permite subir más', () => {
    const view = proTradeView({ ...base, status: 'needs_info', reason: 'Foto con fecha' });
    expect(view.description).toBe('Motivo del revisor: “Foto con fecha”');
    expect(view.canAddEvidence).toBe(true);
  });

  it('solo borrador y falta información aceptan evidencia', () => {
    const allowed = PRO_TRADE_STATUSES.filter(
      (s) => proTradeView({ ...base, status: s }).canAddEvidence,
    );
    expect(allowed).toEqual(['draft', 'needs_info']);
  });
});

describe('observationProgress', () => {
  it('cuenta hasta el máximo', () => {
    expect(observationProgress(1, 3)).toBe('1 de 3');
    expect(observationProgress(5, 3)).toBe('3 de 3');
  });
});

describe('describeMissing', () => {
  it('traduce los faltantes del servidor', () => {
    expect(describeMissing(['dni_front', 'selfie', 'evidence'], 2)).toEqual([
      'DNI (frente)',
      'Selfie sosteniendo tu DNI',
      'Al menos 2 pruebas de tu oficio',
    ]);
  });
});

describe('verificationPath', () => {
  it('arma la ruta dentro de la carpeta del profesional', () => {
    expect(verificationPath('u1', 'dni_front', 'abc', '.JPG')).toBe('u1/dni_front-abc.jpg');
  });
  it('rechaza tipos no permitidos', () => {
    expect(() => verificationPath('u1', 'selfie', 'abc', 'exe')).toThrow();
  });
});
