-- Pruebas de pre-lanzamiento: push (bandeja), reportar/bloquear, soporte, programación,
-- suspensión, reversión de asientos, buscador, datos de pago y anti-abuso de SMS.
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);
delete from public.trade_rate_cards;

create function pg_temp.as_user(p uuid, p_staff text default null) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated',
    'app_metadata', case when p_staff is null then '{}'::json else json_build_object('staff_role', p_staff) end)::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_postgres() returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
create function pg_temp.outbox(p_user uuid, p_kind text) returns int language sql as $$
  select count(*)::int from public.notification_outbox where user_id = p_user and kind = p_kind
$$;

\set c '\'a9000000-0000-0000-0000-000000000000\'::uuid'
\set p '\'b9000000-0000-0000-0000-000000000000\'::uuid'
\set f '\'c9000000-0000-0000-0000-000000000000\'::uuid'
\set x '\'d9000000-0000-0000-0000-000000000000\'::uuid'
\set adm '\'e9000000-0000-0000-0000-000000000000\'::uuid'
insert into auth.users (id, phone, aud, role) values
  (:c, '51911000001', 'authenticated', 'authenticated'),
  (:p, '51911000002', 'authenticated', 'authenticated'),
  (:f, '51911000003', 'authenticated', 'authenticated'),
  (:x, '51911000004', 'authenticated', 'authenticated'),
  (:adm, '51911000005', 'authenticated', 'authenticated');
update public.profiles set full_name = 'Rosa Vargas' where id = :c;
update public.profiles set full_name = 'Carlos Mendoza' where id = :p;
insert into public.pro_trades (pro_id, trade_id, status)
select v.pro, t.id, 'approved_full' from public.trades t, (values (:p), (:f)) v(pro) where t.slug = 'gasfiteria';
insert into public.pro_presence (pro_id, online, radius_m, last_point) values
  (:p, true, 3000, 'SRID=4326;POINT(-75.2049 -12.0651)'),
  (:f, true, 3000, 'SRID=4326;POINT(-75.3500 -12.2000)');

-- ───────── Tokens push ─────────
select pg_temp.as_user(:p);
select lives_ok('select public.register_push_token(''ExponentPushToken[abc123]'', ''android'')', 'el pro registra su token push');
select throws_ok('select public.register_push_token(''no-es-un-token'', ''android'')', '23514', null, 'rechaza tokens inválidos');
select pg_temp.as_user(:c);
select is((select count(*)::int from public.push_tokens), 0, 'nadie ve tokens ajenos');
select throws_ok('select * from public.notification_outbox', '42501', null, 'la bandeja de salida no es accesible desde la app');

-- ───────── a) Pedido nuevo → pros cercanos (PostGIS) ─────────
select pg_temp.as_user(:c);
insert into public.jobs (trade_id, description, offered_price_cents, approx_point, exact_address, schedule_kind, scheduled_for)
select id, 'Fuga en la cocina', 8000, 'SRID=4326;POINT(-75.2050 -12.0655)', 'Jr. Ancash 100', 'scheduled', now() + interval '1 day'
from public.trades where slug = 'gasfiteria';
select id as job from public.jobs where description = 'Fuga en la cocina' \gset
select pg_temp.as_postgres();
select is(pg_temp.outbox(:p, 'job_nearby'), 1, 'notifica al pro cercano con el oficio');
select is(pg_temp.outbox(:f, 'job_nearby'), 0, 'no al pro lejano');
select is(pg_temp.outbox(:c, 'job_nearby'), 0, 'ni al cliente');
select ok((select data ->> 'url' from public.notification_outbox where user_id = :p and kind = 'job_nearby') like '/solicitudes/%/cotizar',
  'con enlace a cotizar');

-- ───────── Programación ─────────
select is((select schedule_kind from public.jobs where id = :'job'), 'scheduled', 'el pedido queda programado');
select pg_temp.as_user(:c);
select throws_ok(format('insert into public.jobs (trade_id, description, offered_price_cents, approx_point, exact_address, schedule_kind, scheduled_for) values (%s, %L, 8000, %L, %L, %L, %L)',
  (select id from public.trades where slug = 'gasfiteria'), 'X', 'SRID=4326;POINT(-75.2 -12.06)', 'Jr. X', 'scheduled', now() + interval '40 days'),
  '22023', null, 'no se programa a más de 30 días');
select throws_ok(format('insert into public.jobs (trade_id, description, offered_price_cents, approx_point, exact_address, schedule_kind) values (%s, %L, 8000, %L, %L, %L)',
  (select id from public.trades where slug = 'gasfiteria'), 'X', 'SRID=4326;POINT(-75.2 -12.06)', 'Jr. X', 'later_today'),
  '22023', null, '“Hoy más tarde” exige hora');
select pg_temp.as_user(:p);
select is((select schedule_kind from public.nearby_jobs() where id = :'job'), 'scheduled', 'el pro ve que el pedido es programado');

-- ───────── b) Oferta → cliente ─────────
insert into public.offers (job_id, price_cents) values (:'job', 9000);
select pg_temp.as_postgres();
select is(pg_temp.outbox(:c, 'offer_new'), 1, 'la oferta notifica al cliente');
select ok((select body from public.notification_outbox where user_id = :c and kind = 'offer_new') like '%S/ 90.00', 'con el monto');

-- ───────── d) Estados ─────────
select pg_temp.as_user(:c);
select public.accept_offer((select id from public.offers where job_id = :'job'));
select pg_temp.as_postgres();
select is(pg_temp.outbox(:p, 'job_accepted'), 1, 'aceptar notifica al pro');
select pg_temp.as_user(:p);
select public.start_trip(:'job');
select pg_temp.as_postgres();
select is(pg_temp.outbox(:c, 'job_on_the_way'), 1, 'en camino notifica al cliente');

-- ───────── c) Chat → la otra parte ─────────
select pg_temp.as_user(:c);
select public.send_job_message(:'job', 'Toca el timbre');
select pg_temp.as_postgres();
select is(pg_temp.outbox(:p, 'chat_message'), 1, 'un mensaje notifica a la otra parte');
select is(pg_temp.outbox(:c, 'chat_message'), 0, 'no al que escribió');

select pg_temp.as_postgres();
update public.jobs set status = 'at_home' where id = :'job';
select pg_temp.as_user(:p);
select public.propose_reevaluation(:'job', 9500, 'client');
select pg_temp.as_postgres();
select is(pg_temp.outbox(:c, 'job_reevaluated'), 1, 'la reevaluación notifica al cliente');
select pg_temp.as_user(:c);
select public.answer_reevaluation(:'job', true);
select pg_temp.as_postgres();
select is(pg_temp.outbox(:p, 'job_renegotiated'), 1, 'aprobarla notifica al pro');
select pg_temp.as_user(:p);
select public.finish_job(:'job');
select pg_temp.as_postgres();
select is(pg_temp.outbox(:c, 'job_finished'), 1, 'terminado notifica al cliente');

-- ───────── Reportar y bloquear ─────────
select pg_temp.as_user(:x);
select throws_ok(format('select public.report_user(%L, %L)', :p, 'fraud'), '42501', null, 'no se reporta a alguien sin pedido en común');
select pg_temp.as_user(:c);
select is((select reason from public.report_user(:p, 'harassment', 'Mensajes fuera de lugar', :'job')), 'harassment', 'el cliente reporta al pro');
select is((select count(*)::int from public.user_blocks where blocker_id = auth.uid()), 1, 'y lo bloquea');
select throws_ok(format('select public.send_job_message(%L, %L)', :'job', 'hola'), '42501', null, 'con bloqueo no hay chat');
select pg_temp.as_user(:p);
select is((select count(*)::int from public.user_reports), 0, 'el reportado no ve el reporte');
select pg_temp.as_user(:c);
insert into public.jobs (trade_id, description, offered_price_cents, approx_point, exact_address)
select id, 'Otro pedido', 8000, 'SRID=4326;POINT(-75.2050 -12.0655)', 'Jr. Ancash 100' from public.trades where slug = 'gasfiteria';
select pg_temp.as_user(:p);
select is((select count(*)::int from public.nearby_jobs() where description = 'Otro pedido'), 0, 'el pro bloqueado no ve los pedidos nuevos del cliente');
select pg_temp.as_postgres();
select is(pg_temp.outbox(:p, 'job_nearby'), 1, 'ni le llega la notificación');

-- ───────── Soporte ─────────
select pg_temp.as_user(:c);
select lives_ok('insert into public.support_tickets (category, subject, body) values (''app'', ''No carga el mapa'', ''Desde ayer el mapa sale en blanco.'')',
  'el usuario abre un ticket de ayuda');
select pg_temp.as_user(:x);
select is((select count(*)::int from public.support_tickets), 0, 'otro usuario no lo ve');
select throws_ok(format('select public.reply_ticket(%L, %L)', (select gen_random_uuid()), 'x'), '42501', null, 'ni lo responde');
select pg_temp.as_user(:adm, 'support');
select is((select status from public.reply_ticket((select id from public.support_tickets limit 1), 'Actualiza la app, ya está corregido.')),
  'answered', 'soporte responde');
select pg_temp.as_postgres();
select is(pg_temp.outbox(:c, 'support_reply'), 1, 'y el usuario recibe la notificación');

-- ───────── Suspensión manual, reversión y buscador ─────────
select pg_temp.as_user(:adm, 'support');
select throws_ok(format('select public.admin_set_suspension(%L, true, %L)', :f, 'x'), '42501', null, 'soporte no suspende (solo admin)');
select pg_temp.as_user(:adm, 'admin');
select lives_ok(format('select public.admin_set_suspension(%L, true, %L)', :f, 'Fraude confirmado'), 'un admin suspende una cuenta');
select pg_temp.as_postgres();
select ok((select banned_until > now() + interval '100 years' from auth.users where id = :f), 'la cuenta queda bloqueada en Auth');
select is((select count(*)::int from public.admin_actions where target_user = :f and action = 'suspend'), 1, 'y auditada');
insert into public.wallet_entries (professional_id, type, amount_cents, idempotency_key) values (:p, 'commission_debit', -950, 'pre:1');
select pg_temp.as_user(:adm, 'admin');
select is((select amount_cents from public.admin_reverse_entry((select id from public.wallet_entries where idempotency_key = 'pre:1'), 'Cobro duplicado')),
  950, 'un admin revierte un asiento con uno opuesto');
select is((select balance_after_cents from public.admin_reverse_entry((select id from public.wallet_entries where idempotency_key = 'pre:1'), 'Otra vez')),
  0, 'revertir dos veces no duplica (idempotente)');
select is((select count(*)::int from public.admin_search('Rosa') where kind = 'user'), 1, 'el buscador encuentra usuarios por nombre');
select is((select count(*)::int from public.admin_search('911000002') where kind = 'user'), 1, 'y por celular');
select pg_temp.as_user(:c);
select is((select count(*)::int from public.admin_search('Rosa')), 0, 'un usuario no puede usar el buscador');

-- ───────── Datos de pago y anti-abuso de SMS ─────────
select ok((select count(*) = 6 from public.settings where key in ('yape_number', 'plin_number', 'account_holder', 'bank_account', 'yape_qr_url', 'plin_qr_url')),
  'existen los parámetros de pago de la empresa');
select pg_temp.as_postgres();
select is(public.hook_before_user_created('{"user":{"phone":"5215512345678"}}'), '{"error": {"message": "Solo se aceptan celulares peruanos (+51 9XX XXX XXX).", "http_code": 403}}'::jsonb,
  'el hook de Auth rechaza números extranjeros');
select is(public.hook_before_user_created('{"user":{"phone":"51987654321"}}'), '{}'::jsonb, 'y acepta celulares peruanos');

select * from finish();
rollback;
