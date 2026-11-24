-- F7 · Código de llegada: tras 3 intentos fallidos se bloquea 10 minutos y se avisa al cliente.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);
set local client_min_messages = warning;
delete from public.trade_rate_cards;

create function pg_temp.as_user(p uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_postgres() returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

\set c '\'b1000000-0000-0000-0000-000000000001\'::uuid'
\set p '\'b1000000-0000-0000-0000-000000000002\'::uuid'
insert into auth.users (id, phone, aud, role) values
  (:c, '51977000001', 'authenticated', 'authenticated'),
  (:p, '51977000002', 'authenticated', 'authenticated');
insert into public.pro_trades (pro_id, trade_id, status)
select :p, id, 'approved_full' from public.trades where slug = 'gasfiteria';

-- Pedido aceptado y "En camino" (directo en la base).
insert into public.jobs (client_id, trade_id, description, offered_price_cents, approx_point, exact_address)
select :c, id, 'Fuga en la cocina', 5000, 'SRID=4326;POINT(-77.03 -12.12)', 'Calle 1'
from public.trades where slug = 'gasfiteria' returning id as job \gset
insert into public.offers (job_id, pro_id, price_cents, status) values (:'job', :p, 5000, 'accepted') returning id as offer \gset
update public.jobs set status = 'on_the_way', accepted_offer_id = :'offer', security_code = '4821' where id = :'job';

select pg_temp.as_user(:p);
select is((select arrival_failed_attempts from public.arrive(:'job', '1111')), 1::smallint, 'primer código equivocado: 1 intento');
select is((select arrival_failed_attempts from public.arrive(:'job', '2222')), 2::smallint, 'segundo: 2 intentos');
select isnt((select arrival_locked_until from public.arrive(:'job', '3333')), null, 'al tercero queda bloqueado');
select throws_ok(format('select public.arrive(%L, %L)', :'job', '4821'), 'P0001', null,
  'bloqueado, ni el código correcto pasa hasta que venza');
select pg_temp.as_postgres();
select is((select count(*)::int from public.notification_outbox where user_id = :c and kind = 'arrival_code_locked'), 1,
  'se avisa al cliente');
select is((select status::text from public.jobs where id = :'job'), 'on_the_way', 'sigue En camino');

-- Vence el bloqueo: con el código correcto llega y se reinicia el contador.
update public.jobs set arrival_locked_until = now() - interval '1 minute' where id = :'job';
select pg_temp.as_user(:p);
select is((select status::text || '|' || arrival_failed_attempts || '|' || coalesce(arrival_locked_until::text, 'sin bloqueo')
  from public.arrive(:'job', '4821')), 'at_home|0|sin bloqueo', 'vencido el bloqueo, el código correcto marca la llegada');

-- El pro ve sus intentos (permiso de columna) y un tercero no puede usar arrive.
select is((select arrival_failed_attempts from public.jobs where id = :'job'), 0::smallint, 'el pro ve el contador');
select pg_temp.as_user(:c);
select throws_ok(format('select public.arrive(%L, %L)', :'job', '4821'), '42501', null, 'el cliente no puede marcar la llegada');

select * from finish();
rollback;
