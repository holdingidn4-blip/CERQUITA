-- Vigilancia de la operación: tareas programadas, cola de notificaciones y llamadas HTTP salientes.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

create function pg_temp.as_user(p uuid, p_staff text default null) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', p, 'role', 'authenticated',
    'app_metadata', case when p_staff is null then '{}'::json else json_build_object('staff_role', p_staff) end
  )::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_postgres() returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

\set a '\'aa000000-0000-0000-0000-000000000001\'::uuid'
\set r '\'aa000000-0000-0000-0000-000000000009\'::uuid'
insert into auth.users (id, phone, aud, role) values
  (:a, '51970000001', 'authenticated', 'authenticated'),
  (:r, '51970000009', 'authenticated', 'authenticated');

-- Datos controlados (la transacción se revierte al final)
delete from public.notification_outbox;
delete from net._http_response;
delete from cron.job_run_details;
insert into public.notification_outbox (user_id, kind, title, body, status, created_at, sent_at) values
  (:a, 'test', 'Nuevo', 'recién encolada', 'pending', now() - interval '1 minute', null),
  (:a, 'test', 'Atascada', 'lleva 20 min', 'pending', now() - interval '20 minutes', null),
  (:a, 'test', 'Enviada', 'ok', 'sent', now() - interval '2 hours', now() - interval '2 hours'),
  (:a, 'test', 'Fallida', 'sin token', 'failed', now() - interval '3 hours', null),
  (:a, 'test', 'Vieja', 'fuera de 24 h', 'sent', now() - interval '3 days', now() - interval '3 days');
insert into net._http_response (id, status_code, content, timed_out, error_msg, created) values
  (1, 200, '{"sent":1}', false, null, now() - interval '30 minutes'),
  (2, 500, 'boom', false, null, now() - interval '10 minutes'),
  (3, null, null, true, 'Timeout of 5000 ms reached', now() - interval '40 minutes');
insert into cron.job_run_details (jobid, runid, database, username, command, status, return_message, start_time, end_time)
select jobid, 1, 'postgres', 'postgres', command, 'succeeded', '1 row', now() - interval '2 minutes', now() - interval '2 minutes'
from cron.job where jobname = 'dispatch-push';
insert into cron.job_run_details (jobid, runid, database, username, command, status, return_message, start_time, end_time)
select jobid, 2, 'postgres', 'postgres', command, 'failed', 'ERROR: algo falló', now() - interval '1 minute', now() - interval '1 minute'
from cron.job where jobname = 'detect-bypass';

-- ───────── Permisos ─────────
select ok(not has_function_privilege('anon', 'public.ops_health()', 'execute'), 'sin sesión no se ve el estado del sistema');
select pg_temp.as_user(:a);
select throws_ok('select public.ops_health()', '42501', 'solo soporte', 'un usuario de la app no lo ve');

-- ───────── Tareas programadas ─────────
select pg_temp.as_user(:r, 'support');
select public.ops_health()::text as h \gset
\set h '(\'' :h '\'::jsonb)'
select set_eq(
  format('select c ->> ''name'' from jsonb_array_elements(%L::jsonb -> ''cron'') c', :h),
  array['purge-job-tracks', 'detect-bypass', 'dispatch-push', 'purge-outbox', 'storage-cleanup', 'schedule-reminders'],
  'lista las 6 tareas programadas'
);
select is((select c ->> 'last_status' from jsonb_array_elements(:h -> 'cron') c where c ->> 'name' = 'dispatch-push'),
  'succeeded', 'última corrida del envío de notificaciones: bien');
select is((select (c ->> 'failures_24h')::int from jsonb_array_elements(:h -> 'cron') c where c ->> 'name' = 'detect-bypass'),
  1, 'una falla en 24 h de la detección de desvíos');
select is((select c ->> 'last_message' from jsonb_array_elements(:h -> 'cron') c where c ->> 'name' = 'detect-bypass'),
  'ERROR: algo falló', 'con su mensaje');
select ok((select c -> 'last_start' = 'null'::jsonb from jsonb_array_elements(:h -> 'cron') c where c ->> 'name' = 'purge-outbox'),
  'una tarea que aún no corre sale sin última corrida');

-- ───────── Cola de notificaciones ─────────
select is((:h -> 'outbox' ->> 'pending')::int, 2, 'pendientes en la cola');
select is((:h -> 'outbox' ->> 'stale')::int, 1, 'atascadas: más de 10 min pendientes');
select is((:h -> 'outbox' ->> 'sent_24h')::int, 1, 'enviadas en 24 h');
select is((:h -> 'outbox' ->> 'failed_24h')::int, 1, 'fallidas en 24 h');
select is((:h -> 'outbox' ->> 'stale_minutes')::int, 10, 'el umbral sale de settings');

-- ───────── Llamadas HTTP salientes (pg_net) ─────────
select is((:h -> 'http' ->> 'total')::int, 3, 'llamadas registradas');
select is((:h -> 'http' ->> 'errors')::int, 2, 'errores: código >= 400 o sin respuesta');
select is((:h -> 'http' -> 'last_error' ->> 'status')::int, 500, 'el último error es el más reciente');

-- El umbral se cambia en Parámetros
select pg_temp.as_postgres();
update public.settings set value = '30' where key = 'ops_outbox_stale_minutes' and scope = 'global';
select pg_temp.as_user(:r, 'reviewer');
select is((public.ops_health() -> 'outbox' ->> 'stale')::int, 0, 'con umbral de 30 min ya no hay atascadas');
select pg_temp.as_postgres();
select is((select value from public.settings where key = 'ops_outbox_stale_minutes' and scope = 'global'), '30'::jsonb,
  'el parámetro existe y es editable');

select * from finish();
rollback;
