-- Pruebas de la fase 5: pedidos, reparto, ofertas y aceptación.
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

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

-- a: cliente · b: otro cliente · p, q: pros cerca · f: pro lejos
\set a '\'a3000000-0000-0000-0000-000000000000\'::uuid'
\set b '\'b3000000-0000-0000-0000-000000000000\'::uuid'
\set p '\'c3000000-0000-0000-0000-000000000000\'::uuid'
\set q '\'d3000000-0000-0000-0000-000000000000\'::uuid'
\set f '\'e3000000-0000-0000-0000-000000000000\'::uuid'
insert into auth.users (id, phone, aud, role) values
  (:a, '51977000001', 'authenticated', 'authenticated'),
  (:b, '51977000002', 'authenticated', 'authenticated'),
  (:p, '51977000003', 'authenticated', 'authenticated'),
  (:q, '51977000004', 'authenticated', 'authenticated'),
  (:f, '51977000005', 'authenticated', 'authenticated');
update public.profiles set full_name = 'Rosa Vargas' where id = :a;
update public.profiles set full_name = 'Carlos Mendoza' where id = :p;
update public.profiles set full_name = 'Luis Alberto Arce' where id = :q;
\set gas '(select id from public.trades where slug = ''gasfiteria'')'
insert into public.pro_trades (pro_id, trade_id, status) values
  (:p, :gas, 'approved_full'), (:q, :gas, 'approved_observation'), (:f, :gas, 'approved_full');
insert into public.pro_presence (pro_id, online, radius_m, last_point) values
  (:p, true, 3000, 'SRID=4326;POINT(-77.0800 -12.0800)'),
  (:q, true, 3000, 'SRID=4326;POINT(-77.0750 -12.0800)'),
  (:f, true, 3000, 'SRID=4326;POINT(-77.3000 -12.3000)');

-- ───────── Utilidades ─────────
select is(private.commission_cents(9500, 1000), 950, 'comisión 10 % de S/ 95 = S/ 9.50');
select is(private.commission_cents(8555, 1000), 855, 'empate de medio céntimo redondea a favor del pro');
select is(private.commission_cents(8556, 1000), 856, 'más de medio céntimo redondea hacia arriba');
select is(private.short_name('Carlos Mendoza'), 'Carlos M.', 'nombre corto con inicial');
select is(private.short_name('Luis Alberto Arce'), 'Luis A.', 'usa la inicial del último apellido');
select is(private.short_name(null), 'Usuario', 'sin nombre');
select is(private.round_distance(812), 800, 'distancia redondeada a 50 m');
select is(private.round_distance(3), 50, 'nunca menos de 50 m');

-- ───────── Cliente: inicio ─────────
select pg_temp.as_user(:a);
select is((select pros from public.nearby_pros_summary('SRID=4326;POINT(-77.0800 -12.0850)', 3000) where trade_id = :gas),
  2, 've cuántos gasfiteros en línea hay cerca (sin el lejano)');
select is((select nearest_m from public.nearby_pros_summary('SRID=4326;POINT(-77.0800 -12.0850)', 3000) where trade_id = :gas),
  550, 'y la distancia del más cercano, redondeada');
select is((select count(*)::int from public.price_hint(:gas)), 0, 'sin 5 pedidos no hay rango de precio');

-- ───────── Cliente: nuevo pedido ─────────
select lives_ok(format(
  'insert into public.jobs (trade_id, description, offered_price_cents, approx_point, exact_address) values (%s, %L, 8000, %L, %L)',
  (select id from public.trades where slug = 'gasfiteria'),
  'Fuga bajo el lavadero', 'SRID=4326;POINT(-77.0800 -12.0850)', 'Jr. Los Pinos 245, dpto 302'), 'el cliente publica un pedido');
select throws_ok('insert into public.jobs (id, trade_id, description, offered_price_cents, approx_point, exact_address) values (gen_random_uuid(), 1, ''x'', 100, ''SRID=4326;POINT(0 0)'', ''x'')',
  '42501', null, 'el cliente no elige el id del pedido');
select id as job_id from public.jobs where client_id = auth.uid() \gset
\set job '\'' :job_id '\'::uuid'
select throws_ok(format('update public.jobs set photos = array[%L] where id = %L', 'otra-carpeta/x.jpg', :job),
  '42501', null, 'las fotos deben estar en la carpeta del pedido');
select lives_ok(format('update public.jobs set photos = array[%L] where id = %L', :job || '/1.jpg', :job), 'agrega fotos de su carpeta');

-- ───────── Profesional: solicitudes cercanas ─────────
select pg_temp.as_user(:p);
select is((select count(*)::int from public.nearby_jobs() where id = :job), 1, 'el pro elegible ve el pedido');
select is((select distance_m from public.nearby_jobs() where id = :job), 550, 'con distancia redondeada');
select is((select client_name from public.nearby_jobs() where id = :job), 'Rosa V.', 'y nombre corto del cliente');
select ok(not exists (
  select 1 from information_schema.routines r join information_schema.parameters x on x.specific_name = r.specific_name
  where r.routine_name = 'nearby_jobs' and x.parameter_name in ('exact_address', 'phone', 'approx_point')
), 'nearby_jobs no devuelve dirección exacta, teléfono ni coordenadas');
select pg_temp.as_user(:f);
select is((select count(*)::int from public.nearby_jobs()), 0, 'el pro lejano no ve el pedido');

-- ───────── Ofertas ─────────
select pg_temp.as_user(:p);
select lives_ok(format('insert into public.offers (job_id, price_cents) values (%L, 8000)', :job), 'pro acepta el precio del cliente');
select is((select my_offer_status::text from public.nearby_jobs() where id = :job), 'pending', 've su oferta en la lista');
select pg_temp.as_user(:q);
select lives_ok(format('insert into public.offers (job_id, price_cents, message) values (%L, 9500, %L)', :job, 'Llevo repuestos'),
  'otro pro manda una contraoferta');
select throws_ok(format('insert into public.offers (job_id, price_cents) values (%L, 9000)', :job), '23505', null,
  'una sola oferta por pro y pedido');
select pg_temp.as_user(:f);
select throws_ok(format('insert into public.offers (job_id, price_cents) values (%L, 7000)', :job), '42501', null,
  'el pro lejano no puede ofertar');

select pg_temp.as_user(:a);
select is((select count(*)::int from public.job_offers(:job)), 2, 'el cliente ve las 2 ofertas');
select is((select pro_name from public.job_offers(:job) order by price_cents limit 1), 'Carlos M.', 'ordenadas por precio, con nombre corto');
select is((select distance_m from public.job_offers(:job) where pro_name = 'Luis A.'), 800, 'con distancia del pro al pedido');
select id as offer_p from public.job_offers(:job) where pro_name = 'Carlos M.' \gset
select is((select array_agg(full_name) from public.pro_profile(:p)), array['Carlos Mendoza'], 've el perfil público del pro');
select pg_temp.as_user(:b);
select is((select count(*)::int from public.job_offers(:job)), 0, 'otro cliente NO ve esas ofertas');
select throws_ok(format('select public.accept_offer(%L)', :'offer_p'), '42501', null, 'otro cliente NO puede aceptar');
select pg_temp.as_user(:p);
select throws_ok(format('select public.accept_offer(%L)', (select id from public.offers where job_id = :job and pro_id = :p)),
  '42501', null, 'el pro NO puede aceptar su oferta');

-- ───────── Aceptar ─────────
select pg_temp.as_postgres();
update public.settings set value = '1200' where key = 'commission_rate_bps' and scope = 'global';
select pg_temp.as_user(:a);
select is((select status::text from public.accept_offer((select id from public.offers where job_id = :job and pro_id = :q))),
  'accepted', 'el cliente acepta la contraoferta');
select pg_temp.as_postgres();
select is((select final_price_cents from public.jobs where id = :job), 9500, 'el precio queda congelado');
select is((select commission_rate_bps from public.jobs where id = :job), 1200, 'la tasa se toma de settings y se congela');
update public.settings set value = '1000' where key = 'commission_rate_bps' and scope = 'global';
select is((select commission_rate_bps from public.jobs where id = :job), 1200, 'cambiar settings después no la altera');
select is((select status::text from public.offers where job_id = :job and pro_id = :p), 'rejected', 'las otras ofertas se rechazan');
select pg_temp.as_user(:a);
select throws_ok(format('select public.accept_offer(%L)', (select id from public.offers where job_id = :job and pro_id = :p)),
  'P0001', null, 'no se acepta dos veces');
select pg_temp.as_user(:p);
select is((select count(*)::int from public.nearby_jobs() where id = :job), 0, 'el pedido aceptado sale de solicitudes');

select * from finish();
rollback;
