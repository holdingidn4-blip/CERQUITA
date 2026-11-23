import { describe, expect, it } from 'vitest';

import {
  certificateHtml,
  isTrainingCode,
  levelLabel,
  normalizeTrainingCode,
  parseQuizText,
  POINTS_REDEEM_NOTE,
} from './reputation';

describe('niveles', () => {
  it('etiquetas en español', () => {
    expect(levelLabel('confianza')).toBe('De confianza');
    expect(levelLabel(null)).toBe('Nuevo');
    expect(levelLabel('otro')).toBe('Nuevo');
  });
  it('el canje no promete dinero, vales ni sorteos', () => {
    expect(POINTS_REDEEM_NOTE).toMatch(/próximamente/);
    expect(POINTS_REDEEM_NOTE).not.toMatch(/dinero|vale|sorteo|S\//i);
  });
});

describe('código de capacitación (igual que el servidor)', () => {
  it('quita el prefijo del QR, espacios y guiones', () => {
    expect(normalizeTrainingCode('cerquita:capacitacion:abcd-efgh')).toBe('ABCDEFGH');
    expect(normalizeTrainingCode(' K7M2 P9QR ')).toBe('K7M2P9QR');
  });
  it('valida 8 caracteres sin 0, O, 1 ni I', () => {
    expect(isTrainingCode('K7M2P9QR')).toBe(true);
    expect(isTrainingCode('K7M2P9Q0')).toBe(false);
    expect(isTrainingCode('K7M2P9Q')).toBe(false);
  });
});

describe('cuestionario escrito en el panel', () => {
  it('una pregunta por línea con la correcta marcada', () => {
    const r = parseQuizText(
      '¿Cortas la luz? | No | *Sí\n\n¿Dónde hablas? | WhatsApp | *Chat de la app | Llamada',
    );
    expect(r).toEqual({
      ok: true,
      quiz: [
        { q: '¿Cortas la luz?', options: ['No', 'Sí'], answer: 1 },
        { q: '¿Dónde hablas?', options: ['WhatsApp', 'Chat de la app', 'Llamada'], answer: 1 },
      ],
    });
  });
  it('explica el error en palabras simples', () => {
    expect(parseQuizText('')).toEqual({ ok: false, error: 'Escribe al menos una pregunta.' });
    expect(parseQuizText('¿Sí? | *Sí')).toMatchObject({ ok: false, error: /2 a 6 opciones/ });
    expect(parseQuizText('¿Sí? | Sí | No')).toMatchObject({ ok: false, error: /una sola opción/ });
    expect(parseQuizText('¿Sí? | *Sí | *No')).toMatchObject({
      ok: false,
      error: /una sola opción/,
    });
  });
});

describe('certificado', () => {
  it('escapa el texto y aclara que no es un título', () => {
    const html = certificateHtml({
      certificate_no: 'CQ-2026-00001',
      pro_name: 'Carlos <Mendoza>',
      title: 'Seguridad eléctrica',
      trade_name: 'Electricidad',
      city_slug: 'huancayo',
      starts_at: '2026-11-24T15:00:00Z',
      passed_at: '2026-11-24T17:00:00Z',
      score: 100,
      points: 100,
    });
    expect(html).toContain('Carlos &lt;Mendoza&gt;');
    expect(html).toContain('Huancayo el 24/11/2026');
    expect(html).toContain('no es un título profesional');
  });
});
