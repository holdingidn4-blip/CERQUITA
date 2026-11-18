-- "El profesional no llega": hora de llegada en la oferta, cambio de profesional, faltas y pausa.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);
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

-- a: cliente · p, q: pros cerca
\set a '\'a8000000-0000-0000-0000-000000000000\'::uuid'
\set p '\'c8000000-0000-0000-0000-000000000000\'::uuid'
\set q '\'d8000000-0000-0000-0000-000000000000\'::uuid'
insert into auth.users (id, phone, aud, role) values
  (:a, '51978000001', 'authenticated', 'authenticated'),
  (:p, '51978000003', 'authenticated', 'authenticated'),
  (:q, '51978000004', 'authenticated', 'authenticated');
update public.profiles set full_name = 'Rosa Vargas' where id = :a;
update public.profiles set full_name = 'Carlos Mendoza' where id = :p;
update public.profiles set full_name = 'Luis Arce' where id = :q;
\set gas '(select id from public.trades where slug = ''gasfiteria'')'
insert into public.pro_trades (pro_id, trade_id, status) values (:p, :gas, 'approved_full'), (:q, :gas, 'approved_full');
insert into public.pro_presence (pro_id, online, radius_m, last_point) values
  (:p, true, 3000, 'SRID=4326;POINT(-77.0800 -12.0800)'),
  (:q, true, 3000, 'SRID=4326;POINT(-77.0750 -12.0800)');

-- ───────── Pedido y ofertas con hora de llegada ─────────
select pg_temp.as_user(:a);
insert into public.jobs (trade_id, description, offered_price_cents, approx_point, exact_address)
values (:gas, 'Fuga bajo el lavadero', 8000, 'SRID=4326;POINT(-77.0800 -12.0850)', 'Jr. Los Pinos 245');
select id as job_id from public.jobs where client_id = auth.uid() \gset
\set job '\'' :job_id '\'::uuid'

select pg_temp.as_user(:p);
select throws_ok(format('insert into public.offers (job_id, price_cents, eta_minutes) values (%L, 8000, 2)', :job),
  '23514', null, 'la hora de llegada va de 5 a 240 minutos');
select lives_ok(format('insert into public.offers (job_id, price_cents, eta_minutes) values (%L, 8000, 20)', :job),
  'el pro cotiza diciendo que llega en 20 min');
select pg_temp.as_user(:q);
select lives_ok(format('insert into public.offers (job_id, price_cents) values (%L, 9000)', :job),
  'otro pro cotiza sin hora de llegada');

select pg_temp.as_user(:a);
select is((select eta_minutes from public.job_offers(:job) where pro_id = :p), 20::smallint,
  'el cliente ve en cuánto llega cada pro');
select is((select status::text from public.accept_offer((select id from public.offers where job_id = :job and pro_id = :p))),
  'accepted', 'el cliente acepta al pro que llega en 20 min');
select is((select promised_arrival_at from public.jobs where id = :job), now() + interval '20 minutes',
  'la llegada acordada es ahora + 20 min');
select is((select assigned_at from public.jobs where id = :job), now(), 'y queda la hora de asignación');
select throws_ok(format('select public.report_no_show(%L)', :job), 'P0001', null,
  'dentro de la tolerancia no se puede cambiar de profesional');

-- Chat y GPS del pro asignado (luego no los verá el siguiente).
select pg_temp.as_user(:p);
select is((select (public.send_job_message(:job, 'Ya salgo') ->> 'blocked')), 'false',
  'el pro asignado escribe en el chat');
select pg_temp.as_postgres();
update public.job_messages set created_at = now() - interval '30 minutes' where job_id = :job;
insert into public.job_tracks (job_id, point, recorded_at) values (:job, 'SRID=4326;POINT(-77.0790 -12.0810)', now() - interval '25 minutes');

-- ───────── Pasó la tolerancia ─────────
update public.jobs set promised_arrival_at = now() - interval '16 minutes' where id = :job;
select pg_temp.as_user(:q);
select throws_ok(format('select public.report_no_show(%L)', :job), '42501', null,
  'solo el cliente puede cambiar de profesional');
select pg_temp.as_user(:a);
select is((select status::text from public.report_no_show(:job)), 'with_offers',
  'el cliente cambia de profesional y vuelve a sus ofertas');
select pg_temp.as_postgres();
select is((select status::text from public.offers where job_id = :job and pro_id = :p), 'no_show',
  'la oferta del que faltó queda como llegada incumplida');
select is((select status::text from public.offers where job_id = :job and pro_id = :q), 'pending',
  'la otra oferta vuelve a estar en pie');
select is((select count(*)::int from public.pro_no_shows where pro_id = :p and job_id = :job), 1,
  'se registra la falta del profesional');
select ok((select accepted_offer_id is null and final_price_cents is null and commission_rate_bps is null
  and promised_arrival_at is null from public.jobs where id = :job), 'el pedido queda sin asignación ni precio congelado');
select is((select count(*)::int from public.notification_outbox where user_id = :p and kind = 'job_no_show'), 1,
  'se avisa al profesional que faltó');
select is((select count(*)::int from public.notification_outbox where user_id = :q and kind = 'offer_reopened'), 1,
  'y al que tenía su oferta en pie');

select pg_temp.as_user(:p);
select is((select count(*)::int from public.nearby_jobs() where id = :job), 0, 'el que faltó ya no ve ese pedido');
select is((select no_shows from public.my_reliability()), 1, 've su llegada incumplida');
select ok(not (select paused from public.my_reliability()), 'con 1 falta no está en pausa');
select is((select count(*)::int from public.pro_no_shows), 1, 've solo sus faltas');
select pg_temp.as_user(:q);
select is((select count(*)::int from public.pro_no_shows), 0, 'otro pro no ve las faltas ajenas');

-- ───────── El siguiente profesional ─────────
select pg_temp.as_user(:a);
select is((select status::text from public.accept_offer((select id from public.offers where job_id = :job and pro_id = :q))),
  'accepted', 'el cliente acepta la siguiente oferta');
select is((select promised_arrival_at from public.jobs where id = :job), now() + interval '60 minutes',
  'sin hora en la oferta, la llegada usa el valor por defecto de settings');
select pg_temp.as_user(:q);
select is((select count(*)::int from public.job_messages where job_id = :job), 0, 'el nuevo pro no ve el chat del anterior');
select is((select count(*)::int from public.job_tracks where job_id = :job), 0, 'ni su GPS');
select pg_temp.as_user(:a);
select is((select count(*)::int from public.job_messages where job_id = :job), 1, 'el cliente conserva su chat');

-- ───────── Pausa por faltas (ventana móvil) ─────────
select pg_temp.as_postgres();
update public.settings set value = '1' where key = 'no_show_strikes' and scope = 'global';
select pg_temp.as_user(:a);
insert into public.jobs (trade_id, description, offered_price_cents, approx_point, exact_address, schedule_kind, scheduled_for)
values (:gas, 'Cambiar la llave del baño', 6000, 'SRID=4326;POINT(-77.0800 -12.0850)', 'Jr. Los Pinos 245', 'scheduled', now() + interval '2 days');
select id as job2_id from public.jobs where client_id = auth.uid() and description = 'Cambiar la llave del baño' \gset
\set job2 '\'' :job2_id '\'::uuid'
select pg_temp.as_user(:p);
select ok((select paused from public.my_reliability()), 'con el límite de faltas, sus ofertas se pausan');
select throws_ok(format('insert into public.offers (job_id, price_cents, eta_minutes) values (%L, 6000, 30)', :job2),
  '42501', null, 'en pausa no puede cotizar');
select pg_temp.as_postgres();
update public.pro_no_shows set reported_at = now() - interval '31 days' where pro_id = :p;
select pg_temp.as_user(:p);
select ok(not (select paused from public.my_reliability()), 'la pausa se levanta cuando la falta sale de la ventana');

-- ───────── Pedido programado: la llegada es la hora programada ─────────
select pg_temp.as_user(:p);
select lives_ok(format('insert into public.offers (job_id, price_cents, eta_minutes) values (%L, 6000, 30)', :job2),
  'ya puede cotizar de nuevo');
select pg_temp.as_user(:a);
select is((select promised_arrival_at from public.accept_offer((select id from public.offers where job_id = :job2 and pro_id = :p))),
  (select scheduled_for from public.jobs where id = :job2), 'en un pedido programado, la llegada acordada es la hora programada');

select ok(not has_function_privilege('anon', 'public.report_no_show(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.my_reliability()', 'execute')
  and not has_function_privilege('anon', 'public.job_offers(uuid)', 'execute'),
  'sin sesión no se ejecutan las funciones nuevas (privilegios por defecto sin PUBLIC)');

select * from finish();
rollback;
