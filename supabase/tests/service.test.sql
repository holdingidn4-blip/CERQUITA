-- Pruebas de la fase 6: servicio en curso, código, ubicación, chat, confirmación y cancelación.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);
-- Las semillas traen un tarifario de ejemplo; cada prueba define el suyo (se revierte al final).
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

\set c '\'a4000000-0000-0000-0000-000000000000\'::uuid'
\set p '\'b4000000-0000-0000-0000-000000000000\'::uuid'
\set x '\'c4000000-0000-0000-0000-000000000000\'::uuid'
insert into auth.users (id, phone, aud, role) values
  (:c, '51966000001', 'authenticated', 'authenticated'),
  (:p, '51966000002', 'authenticated', 'authenticated'),
  (:x, '51966000003', 'authenticated', 'authenticated');
insert into public.jobs (id, client_id, trade_id, description, offered_price_cents, approx_point, exact_address)
select '10000000-0000-0000-0000-0000000000c6', :c, id, 'Fuga', 8000, 'SRID=4326;POINT(-77.03 -12.12)', 'Calle 1'
from public.trades where slug = 'gasfiteria';
\set job '\'10000000-0000-0000-0000-0000000000c6\'::uuid'
insert into public.offers (id, job_id, pro_id, price_cents, status)
values ('20000000-0000-0000-0000-0000000000c6', :job, :p, 9000, 'accepted');
update public.jobs set status = 'accepted', accepted_offer_id = '20000000-0000-0000-0000-0000000000c6',
  final_price_cents = 9000, commission_rate_bps = 1000 where id = :job;

-- ───────── Ir al domicilio ─────────
select pg_temp.as_user(:c);
select throws_ok(format('select public.start_trip(%L)', :job), '42501', null, 'el cliente no inicia el viaje');
select throws_ok('update public.jobs set status = ''cancelled''', '42501', null, 'nadie cambia el estado con UPDATE directo');
select pg_temp.as_user(:x);
select throws_ok(format('select public.start_trip(%L)', :job), '42501', null, 'otro pro tampoco');
select pg_temp.as_user(:p);
select is((select status::text from public.start_trip(:job)), 'on_the_way', 'el pro asignado sale al domicilio');
select throws_ok(format('select public.start_trip(%L)', :job), 'P0001', null, 'no se inicia dos veces');
select throws_ok('select security_code from public.jobs', '42501', null, 'el pro no puede leer el código');
select is(public.job_security_code(:job), null, 'ni con la función');
select lives_ok(format('insert into public.job_tracks (job_id, point) values (%L, %L)', :job, 'SRID=4326;POINT(-77.0350 -12.1200)'),
  'envía su ubicación en camino');

select pg_temp.as_user(:c);
select ok(public.job_security_code(:job) ~ '^\d{4}$', 'el cliente ve un código de 4 dígitos');
select is((select distance_m from public.job_live_location(:job)), 550, 'el cliente ve la posición en vivo y la distancia');
select pg_temp.as_user(:x);
select is((select count(*)::int from public.job_live_location(:job)), 0, 'nadie más ve la posición');

select pg_temp.as_user(:c);
select is((select name from public.job_counterpart(:job)), 'Usuario', 'el cliente ve el nombre corto del pro');
select is((select phone from public.job_counterpart(:job)), '51966000002', 'y su teléfono con el servicio activo');
select pg_temp.as_user(:x);
select is((select count(*)::int from public.job_counterpart(:job)), 0, 'un tercero no ve a nadie');
select pg_temp.as_user(:c);

-- ───────── Chat ─────────
select pg_temp.as_user(:c);
select lives_ok(format('insert into public.job_messages (job_id, body) values (%L, %L)', :job, 'Toca el timbre 302'), 'el cliente escribe');
select pg_temp.as_user(:p);
select lives_ok(format('insert into public.job_messages (job_id, body) values (%L, %L)', :job, 'Llego en 5 min'), 'el pro responde');
select is((select count(*)::int from public.job_messages where job_id = :job), 2, 'ambos ven la conversación');
select pg_temp.as_user(:x);
select is((select count(*)::int from public.job_messages where job_id = :job), 0, 'un tercero no ve el chat');
select throws_ok(format('insert into public.job_messages (job_id, body) values (%L, %L)', :job, 'hola'), '42501', null,
  'ni puede escribir');

-- ───────── Llegué ─────────
select pg_temp.as_user(:p);
select throws_ok(format('select public.arrive(%L, %L)', :job, '0000x'), '22023', null, 'código equivocado no sirve');
select pg_temp.as_postgres();
select security_code as code from public.jobs where id = :job \gset
select pg_temp.as_user(:p);
select is((select status::text from public.arrive(:job, :'code')), 'at_home', 'con el código del cliente queda En el domicilio');
select pg_temp.as_user(:c);
select is((select count(*)::int from public.job_live_location(:job)), 1, 'en el domicilio el cliente aún ve la posición');

-- ───────── Terminado y confirmación ─────────
select pg_temp.as_user(:c);
select throws_ok(format('select public.finish_job(%L)', :job), '42501', null, 'el cliente no marca Terminado');
select pg_temp.as_user(:p);
select is((select final_proposed_cents from public.finish_job(:job, 9500)), 9500, 'el pro marca Terminado con S/ 95');
select throws_ok(format('insert into public.job_tracks (job_id, point) values (%L, %L)', :job, 'SRID=4326;POINT(-77.03 -12.12)'),
  '42501', null, 'tras Terminado se corta la ubicación');
select throws_ok(format('select public.confirm_job(%L)', :job), '42501', null, 'el pro no confirma');
select pg_temp.as_user(:c);
select is((select count(*)::int from public.job_live_location(:job)), 0, 'el cliente deja de ver la posición');
select is((select status::text from public.confirm_job(:job, false)), 'at_home', 'el cliente rechaza un monto distinto');
select pg_temp.as_user(:p);
select public.finish_job(:job);
select pg_temp.as_user(:c);
select is((select final_price_cents from public.confirm_job(:job)), 9000, 'confirma el monto acordado');
select is((select status::text from public.confirm_job(:job)), 'confirmed', 'confirmar dos veces no falla ni cambia nada');

-- ───────── Cancelación ─────────
select pg_temp.as_postgres();
insert into public.jobs (id, client_id, trade_id, description, offered_price_cents, approx_point, exact_address)
select '10000000-0000-0000-0000-0000000000d6', :c, id, 'Otra', 5000, 'SRID=4326;POINT(-77.03 -12.12)', 'Calle 2'
from public.trades where slug = 'gasfiteria';
select pg_temp.as_user(:c);
select throws_ok(format('select public.cancel_service(%L, %L)', '10000000-0000-0000-0000-0000000000d6', ' '), '22023', null,
  'cancelar exige motivo');
select is((select status::text from public.cancel_service('10000000-0000-0000-0000-0000000000d6', 'Ya lo arreglé')),
  'cancelled', 'el cliente cancela con motivo');

select * from finish();
rollback;
