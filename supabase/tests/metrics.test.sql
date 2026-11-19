-- Métricas del piloto: pedidos por día (hora de Lima), tiempo a la primera oferta y % contratado.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);
delete from public.trade_rate_cards;
-- Sin los pedidos demo del seed (la transacción se revierte al final)
set local client_min_messages = warning;
truncate public.jobs cascade;

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

\set a '\'a9000000-0000-0000-0000-000000000000\'::uuid'
\set p '\'c9000000-0000-0000-0000-000000000000\'::uuid'
\set q '\'d9000000-0000-0000-0000-000000000000\'::uuid'
\set r '\'e9000000-0000-0000-0000-000000000000\'::uuid'
insert into auth.users (id, phone, aud, role) values
  (:a, '51979000001', 'authenticated', 'authenticated'),
  (:p, '51979000003', 'authenticated', 'authenticated'),
  (:q, '51979000004', 'authenticated', 'authenticated'),
  (:r, '51979000009', 'authenticated', 'authenticated');
\set gas '(select id from public.trades where slug = ''gasfiteria'')'
-- Medianoche de hoy en Lima
select ((now() at time zone 'America/Lima')::date)::text as today \gset
\set t0 '(\'' :today '\'::timestamp at time zone \'America/Lima\')'

-- Pedidos (j1–j7) con su hora de publicación
create function pg_temp.job(p_client uuid, p_trade smallint, p_at timestamptz) returns uuid
language plpgsql as $$
declare v uuid;
begin
  insert into public.jobs (client_id, trade_id, description, offered_price_cents, approx_point, exact_address)
  values (p_client, p_trade, 'Pedido de métricas', 8000, 'SRID=4326;POINT(-75.2100 -12.0650)', 'Jr. Real 100')
  returning id into v;
  update public.jobs set created_at = p_at where id = v;
  return v;
end $$;
create function pg_temp.offer(p_job uuid, p_pro uuid, p_after interval, p_status public.offer_status) returns void
language plpgsql as $$
declare v uuid;
begin
  insert into public.offers (job_id, pro_id, price_cents)
  values (p_job, p_pro, 8000) returning id into v;
  update public.offers
  set created_at = (select created_at from public.jobs where id = p_job) + p_after, status = p_status
  where id = v;
end $$;

select pg_temp.job(:a, :gas, :t0 + interval '1 minute') as j1 \gset
select pg_temp.job(:a, :gas, :t0 + interval '2 minutes') as j2 \gset
select pg_temp.job(:a, :gas, :t0 + interval '3 minutes') as j3 \gset
select pg_temp.job(:a, :gas, :t0 - interval '3 days' + interval '1 minute') as j4 \gset
select pg_temp.job(:a, :gas, :t0 - interval '40 days') as j5 \gset
select pg_temp.job(:a, :gas, :t0 - interval '1 day' + interval '1 minute') as j6 \gset
select pg_temp.job(:a, :gas, :t0 - interval '1 minute') as j7 \gset

-- j1: primera oferta a los 10 min, contratado · j2: oferta a los 30 min, sin contratar · j3: cancelado sin ofertas
select pg_temp.offer(:'j1', :p, interval '10 minutes', 'accepted');
select pg_temp.offer(:'j1', :q, interval '25 minutes', 'rejected');
select pg_temp.offer(:'j2', :p, interval '30 minutes', 'pending');
update public.jobs set status = 'cancelled' where id = :'j3';
-- j4: hace 3 días, oferta a los 20 min, terminado y confirmado
select pg_temp.offer(:'j4', :p, interval '20 minutes', 'accepted');
update public.jobs set status = 'confirmed' where id = :'j4';
-- j5: hace 40 días (fuera de la ventana de 14) · j6: ayer, oferta a los 5 min, el pro no llegó (cuenta como contratado)
select pg_temp.offer(:'j5', :p, interval '15 minutes', 'accepted');
select pg_temp.offer(:'j6', :q, interval '5 minutes', 'no_show');
-- j7: un minuto antes de la medianoche de Lima: cuenta para ayer, no para hoy

-- ───────── Permisos ─────────
select ok(not has_function_privilege('anon', 'public.pilot_metrics(int)', 'execute'),
  'sin sesión no se pueden leer las métricas');
select ok(has_function_privilege('authenticated', 'public.pilot_metrics(int)', 'execute'),
  'con sesión se puede llamar (y adentro se exige soporte)');
select pg_temp.as_user(:a);
select throws_ok('select public.pilot_metrics(14)', '42501', 'solo soporte', 'un cliente no ve las métricas');
select pg_temp.as_user(:p);
select throws_ok('select public.pilot_metrics(14)', '42501', 'solo soporte', 'un profesional tampoco');

-- ───────── Ventana de 14 días ─────────
select pg_temp.as_user(:r, 'reviewer');
select public.pilot_metrics(14)::text as m \gset
\set m '(\'' :m '\'::jsonb)'
select is((:m ->> 'days')::int, 14, 'ventana de 14 días');
select is(jsonb_array_length(:m -> 'daily'), 14, 'una fila por día, también los días sin pedidos');
select is((:m ->> 'to')::date, :'today'::date, 'el último día es hoy en Lima');
select is((:m -> 'totals' ->> 'published')::int, 6, 'publicados en 14 días (sin el de hace 40 días)');
select is((:m -> 'totals' ->> 'with_offer')::int, 4, 'con al menos una oferta');
select is((:m -> 'totals' ->> 'hired')::int, 3, 'contratados: oferta aceptada, aunque el pro no llegara');
select is((:m -> 'totals' ->> 'completed')::int, 1, 'terminados y confirmados');
select is((:m -> 'totals' ->> 'cancelled')::int, 1, 'cancelados');
select is((:m -> 'totals' ->> 'median_first_offer_min')::numeric, 15.0,
  'mediana a la primera oferta: 5, 10, 20, 30 → 15 min (cuenta la primera, no las siguientes)');
select is((:m -> 'totals' ->> 'p90_first_offer_min')::numeric, 27.0, 'percentil 90 a la primera oferta');

select is((select (d ->> 'published')::int from jsonb_array_elements(:m -> 'daily') d where (d ->> 'day')::date = :'today'::date),
  3, 'hoy: 3 publicados (el de las 23:59 de ayer va a ayer)');
select is((select (d ->> 'median_first_offer_min')::numeric from jsonb_array_elements(:m -> 'daily') d where (d ->> 'day')::date = :'today'::date),
  20.0, 'hoy: mediana de 10 y 30 min');
select is((select (d ->> 'published')::int from jsonb_array_elements(:m -> 'daily') d where (d ->> 'day')::date = :'today'::date - 1),
  2, 'ayer: 2 publicados, cortando por la medianoche de Lima');
select is((select (d ->> 'completed')::int from jsonb_array_elements(:m -> 'daily') d where (d ->> 'day')::date = :'today'::date - 3),
  1, 'hace 3 días: 1 terminado');
select ok((select (d ->> 'published')::int = 0 and d -> 'median_first_offer_min' = 'null'::jsonb
  from jsonb_array_elements(:m -> 'daily') d where (d ->> 'day')::date = :'today'::date - 5),
  'un día sin pedidos sale en 0 y sin mediana');

-- ───────── Límites de la ventana ─────────
select is((public.pilot_metrics(90) -> 'totals' ->> 'published')::int, 7, 'en 90 días entra el de hace 40');
select is((public.pilot_metrics(0) ->> 'days')::int, 1, 'la ventana mínima es 1 día');
select is((public.pilot_metrics(500) ->> 'days')::int, 90, 'la ventana máxima es 90 días');

select * from finish();
rollback;
