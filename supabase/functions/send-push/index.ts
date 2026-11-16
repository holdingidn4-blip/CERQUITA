// Edge Function: envía las notificaciones pendientes de public.notification_outbox con Expo Push.
// La invoca pg_cron cada minuto (private.dispatch_push) con el secreto de Vault “push_function_secret”.
// Deploy: supabase functions deploy send-push --no-verify-jwt
// Secretos opcionales: EXPO_ACCESS_TOKEN y PUSH_FUNCTION_SECRET (si existe, se usa en lugar de Vault).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  buildMessages,
  chunk,
  invalidTokens,
  outcomes,
  type ExpoTicket,
  type OutboxRow,
} from '../_shared/push.ts';

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';

/** El llamado debe traer el secreto de Vault (o PUSH_FUNCTION_SECRET si está configurado). */
async function authorized(req: Request, supabase: SupabaseClient): Promise<boolean> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token.length < 32) return false;
  const envSecret = Deno.env.get('PUSH_FUNCTION_SECRET');
  if (envSecret) return token === envSecret;
  const { data } = await supabase.rpc('push_secret_matches', { p_secret: token });
  return data === true;
}

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      auth: { persistSession: false },
    },
  );
  if (!(await authorized(req, supabase))) {
    return new Response('No autorizado', { status: 401 });
  }

  const { data: rows, error } = await supabase
    .from('notification_outbox')
    .select('id, user_id, title, body, data')
    .eq('status', 'pending')
    .lt('attempts', 3)
    .order('created_at')
    .limit(300);
  if (error) return new Response(error.message, { status: 500 });
  if (!rows?.length) return Response.json({ sent: 0 });

  const outbox = rows as OutboxRow[];
  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token, user_id')
    .in('user_id', [...new Set(outbox.map((r) => r.user_id))]);
  const { messages, origin } = buildMessages(outbox, tokens ?? []);

  const tickets: ExpoTicket[] = [];
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  for (const batch of chunk(messages)) {
    const res = await fetch(EXPO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(batch),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: ExpoTicket[] };
    tickets.push(
      ...(json.data ??
        batch.map(() => ({ status: 'error' as const, message: `HTTP ${res.status}` }))),
    );
  }

  const dead = invalidTokens(messages, tickets);
  if (dead.length) await supabase.from('push_tokens').delete().in('token', dead);

  const result = outcomes(outbox, origin, tickets);
  const idsWith = (status: 'sent' | 'failed' | 'skipped') =>
    [...result].filter(([, s]) => s === status).map(([id]) => id);
  const now = new Date().toISOString();
  if (idsWith('sent').length)
    await supabase
      .from('notification_outbox')
      .update({ status: 'sent', sent_at: now })
      .in('id', idsWith('sent'));
  // Sin token registrado: se omite (el usuario no tiene la app o negó el permiso).
  if (idsWith('skipped').length)
    await supabase
      .from('notification_outbox')
      .update({ status: 'skipped', sent_at: now })
      .in('id', idsWith('skipped'));
  // Error de Expo: se reintenta hasta 3 veces (outbox_mark_failed suma el intento).
  if (idsWith('failed').length)
    await supabase.rpc('outbox_mark_failed', { p_ids: idsWith('failed'), p_error: 'expo error' });
  return Response.json({ messages: messages.length, invalidTokens: dead.length });
});
