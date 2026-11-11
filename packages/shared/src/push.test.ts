import { describe, expect, it } from 'vitest';
import {
  buildMessages,
  chunk,
  invalidTokens,
  outcomes,
  type OutboxRow,
} from '../../../supabase/functions/_shared/push';

const rows: OutboxRow[] = [
  { id: 1, user_id: 'u1', title: 'Oferta', body: 'S/ 90', data: { url: '/pedido/1/ofertas' } },
  { id: 2, user_id: 'u2', title: 'Chat', body: 'Hola', data: {} },
  { id: 3, user_id: 'u3', title: 'Sin token', body: '...', data: {} },
];
const tokens = [
  { token: 'ExponentPushToken[a]', user_id: 'u1' },
  { token: 'ExponentPushToken[b]', user_id: 'u1' },
  { token: 'ExponentPushToken[c]', user_id: 'u2' },
];

describe('Edge Function send-push (lógica pura)', () => {
  it('un mensaje por dispositivo de cada destinatario', () => {
    const { messages, origin } = buildMessages(rows, tokens);
    expect(messages.map((m) => m.to)).toEqual([
      'ExponentPushToken[a]',
      'ExponentPushToken[b]',
      'ExponentPushToken[c]',
    ]);
    expect(origin).toEqual([1, 1, 2]);
    expect(messages[0]).toMatchObject({
      title: 'Oferta',
      data: { url: '/pedido/1/ofertas' },
      priority: 'high',
    });
  });
  it('lotes de 100 (límite de Expo)', () => {
    expect(chunk(Array.from({ length: 250 }, (_, i) => i)).map((c) => c.length)).toEqual([
      100, 100, 50,
    ]);
  });
  it('detecta tokens dados de baja', () => {
    const { messages } = buildMessages(rows, tokens);
    expect(
      invalidTokens(messages, [
        { status: 'ok', id: '1' },
        { status: 'error', details: { error: 'DeviceNotRegistered' } },
        { status: 'error', details: { error: 'MessageRateExceeded' } },
      ]),
    ).toEqual(['ExponentPushToken[b]']);
  });
  it('estado por fila: enviada, fallida u omitida (sin token)', () => {
    const { origin } = buildMessages(rows, tokens);
    const result = outcomes(rows, origin, [
      { status: 'error' },
      { status: 'ok' },
      { status: 'error' },
    ]);
    expect(Object.fromEntries(result)).toEqual({ 1: 'sent', 2: 'failed', 3: 'skipped' });
  });
});
