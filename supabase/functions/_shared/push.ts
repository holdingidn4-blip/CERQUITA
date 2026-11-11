// Lógica pura del envío push (sin dependencias: la usan la Edge Function en Deno y las pruebas en Node).

export type OutboxRow = {
  id: number;
  user_id: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
};
export type TokenRow = { token: string; user_id: string };
export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: 'default';
  priority: 'high';
  channelId: 'default';
};
export type ExpoTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

/** Un mensaje por token de cada destinatario. Devuelve también qué fila de la bandeja originó cada mensaje. */
export function buildMessages(
  rows: OutboxRow[],
  tokens: TokenRow[],
): { messages: ExpoMessage[]; origin: number[] } {
  const byUser = new Map<string, string[]>();
  for (const t of tokens) byUser.set(t.user_id, [...(byUser.get(t.user_id) ?? []), t.token]);
  const messages: ExpoMessage[] = [];
  const origin: number[] = [];
  for (const row of rows) {
    for (const to of byUser.get(row.user_id) ?? []) {
      messages.push({
        to,
        title: row.title,
        body: row.body,
        data: row.data,
        sound: 'default',
        priority: 'high',
        channelId: 'default',
      });
      origin.push(row.id);
    }
  }
  return { messages, origin };
}

/** Expo acepta hasta 100 mensajes por solicitud. */
export function chunk<T>(items: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Tokens que Expo reporta como no registrados: se borran para no reintentar. */
export function invalidTokens(messages: ExpoMessage[], tickets: ExpoTicket[]): string[] {
  return tickets
    .map((t, i) =>
      t.status === 'error' && t.details?.error === 'DeviceNotRegistered'
        ? messages[i]?.to
        : undefined,
    )
    .filter((t): t is string => typeof t === 'string');
}

/** Estado final de cada fila: enviada si al menos un ticket salió bien; sin tokens = omitida. */
export function outcomes(
  rows: OutboxRow[],
  origin: number[],
  tickets: ExpoTicket[],
): Map<number, 'sent' | 'failed' | 'skipped'> {
  const result = new Map<number, 'sent' | 'failed' | 'skipped'>(rows.map((r) => [r.id, 'skipped']));
  tickets.forEach((t, i) => {
    const id = origin[i];
    if (id === undefined) return;
    if (t.status === 'ok') result.set(id, 'sent');
    else if (result.get(id) !== 'sent') result.set(id, 'failed');
  });
  return result;
}
