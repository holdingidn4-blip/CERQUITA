-- Pruebas de la fase 7: comisión, idempotencia, promoción, pausa, constancias y calificaciones.
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);
-- Las semillas traen un tarifario de ejemplo; cada prueba define el suyo (se revierte al final).
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

\set c '\'a5000000-0000-0000-0000-000000000000\'::uuid'
\set p '\'b5000000-0000-0000-0000-000000000000\'::uuid'
\set s '\'c5000000-0000-0000-0000-000000000000\'::uuid'
insert into auth.users (id, phone, aud, role) values
  (:c, '51955000001', 'authenticated', 'authenticated'),
  (:p, '51955000002', 'authenticated', 'authenticated'),
  (:s, '51955000003', 'authenticated', 'authenticated');
insert into public.pro_trades (pro_id, trade_id, status) select :p, id, 'approved_full' from public.trades where slug = 'gasfiteria';
insert into public.pro_presence (pro_id, online, radius_m, last_point) values (:p, true, 5000, 'SRID=4326;POINT(-77.03 -12.12)');

-- Crea un trabajo terminado por el pro con el precio dado y tasa 10 %.
create function pg_temp.finished(p_price int) returns uuid
language plpgsql as $$
declare v_job uuid; v_offer uuid;
begin
  insert into public.jobs (client_id, trade_id, description, offered_price_cents, approx_point, exact_address)
  select 'a5000000-0000-0000-0000-000000000000', id, 'Trabajo', p_price, 'SRID=4326;POINT(-77.03 -12.12)', 'Calle'
  from public.trades where slug = 'gasfiteria' returning id into v_job;
  insert into public.offers (job_id, pro_id, price_cents, status)
  values (v_job, 'b5000000-0000-0000-0000-000000000000', p_price, 'accepted') returning id into v_offer;
  update public.jobs set status = 'finished', accepted_offer_id = v_offer, final_price_cents = p_price,
    final_proposed_cents = p_price, commission_rate_bps = 1000 where id = v_job;
  return v_job;
end $$;
create function pg_temp.balance() returns int language sql as $$
  select coalesce(sum(amount_cents), 0)::int from public.wallet_entries where professional_id = 'b5000000-0000-0000-0000-000000000000'
$$;

-- ───────── Comisión al confirmar ─────────
select pg_temp.finished(9500) as job1 \gset
select pg_temp.as_user(:c);
select is((select status::text from public.confirm_job(:'job1')), 'confirmed', 'el cliente confirma');
select pg_temp.as_postgres();
select is((select amount_cents from public.wallet_entries where idempotency_key = 'job:' || :'job1' || ':commission'), -950,
  'se crea commission_debit de S/ 9.50 (10 % de S/ 95)');
select is((select balance_after_cents from public.wallet_entries where idempotency_key = 'job:' || :'job1' || ':commission'), -950,
  'con saldo calculado en el servidor');
select pg_temp.as_user(:c);
select public.confirm_job(:'job1');
select public.confirm_job(:'job1');
select pg_temp.as_postgres();
select is((select count(*)::int from public.wallet_entries where job_id = :'job1'), 1, 'confirmar otra vez NO duplica el cobro');
select throws_ok(format('select private.post_commission(%L)', (select pg_temp.finished(5000))), 'P0001', null,
  'no se cobra comisión de un trabajo no confirmado');

-- ───────── Lectura y escritura del libro ─────────
select pg_temp.as_user(:p);
select is((select pending_cents from public.pro_debt()), 950, 'el pro ve su comisión pendiente');
select is((select limit_cents from public.pro_debt()), 3000, 'y el límite desde settings');
select is((select paused from public.pro_debt()), false, 'bajo el límite no está en pausa');
select throws_ok(format('select private.wallet_post(%L, %L, 100, %L)', :p, 'payment_credit', 'x'), '42501', null,
  'la app no puede escribir en el libro');
select pg_temp.as_user(:c);
select throws_ok(format('select * from public.pro_debt(%L)', :p), '42501', null, 'otro usuario no ve su deuda');

-- ───────── Sobre el límite: gracia y pausa ─────────
select pg_temp.as_postgres();
select pg_temp.finished(30000) as job2 \gset
select pg_temp.as_user(:c);
select public.confirm_job(:'job2');
select pg_temp.as_user(:p);
select is((select pending_cents from public.pro_debt()), 3950, 'S/ 39.50 pendientes: pasó el límite de S/ 30');
select ok((select over_limit_since is not null from public.pro_debt()), 'se registra desde cuándo está sobre el límite');
select is((select paused from public.pro_debt()), false, 'durante los 3 días de gracia aún puede ofertar');
select is((select paused from private.pro_debt_at(:p, now() + interval '4 days')), true, 'después de 3 días queda en pausa');
select is((select pay_to_reactivate_cents from public.pro_debt()), 950, 'para reactivarse debe pagar más de S/ 9.50');

select pg_temp.as_postgres();
update public.settings set value = '0' where key = 'grace_days';
insert into public.jobs (id, client_id, trade_id, description, offered_price_cents, approx_point, exact_address)
select '10000000-0000-0000-0000-0000000000e7', :c, id, 'Nuevo', 6000, 'SRID=4326;POINT(-77.03 -12.12)', 'Calle'
from public.trades where slug = 'gasfiteria';
select pg_temp.as_user(:p);
select is((select paused from public.pro_debt()), true, 'sin días de gracia queda en pausa');
select is((select count(*)::int from public.nearby_jobs() where id = '10000000-0000-0000-0000-0000000000e7'), 1,
  'en pausa sigue viendo los pedidos');
select throws_ok('insert into public.offers (job_id, price_cents) values (''10000000-0000-0000-0000-0000000000e7'', 6000)',
  '42501', null, 'pero NO puede enviar ofertas nuevas');

-- ───────── Constancia de pago y reactivación ─────────
select lives_ok('insert into public.payment_proofs (method, operation_code, amount_cents, image_path) values (''yape'', ''0519920'', 1000, auth.uid() || ''/yape.jpg'')',
  'el pro sube su constancia de Yape');
select throws_ok('update public.payment_proofs set status = ''approved''', '42501', null, 'no se aprueba sola');
select throws_ok(format('select public.review_payment_proof(%L, true)', (select id from public.payment_proofs where professional_id = :p)),
  '42501', null, 'el pro no puede revisar');
select pg_temp.as_user(:s, 'support');
select is((select status::text from public.review_payment_proof((select id from public.payment_proofs where professional_id = :p), true)),
  'approved', 'soporte aprueba la constancia');
select throws_ok(format('select public.review_payment_proof(%L, true)', (select id from public.payment_proofs where professional_id = :p)),
  'P0001', null, 'no se aprueba dos veces');
select pg_temp.as_postgres();
select is((select amount_cents from public.wallet_entries where idempotency_key = 'proof:' || (select id from public.payment_proofs where professional_id = :p)),
  1000, 'se crea payment_credit de S/ 10');
select is(pg_temp.balance(), -2950, 'saldo: −39.50 + 10.00 = −29.50');
select pg_temp.as_user(:p);
select is((select paused from public.pro_debt()), false, 'bajo el límite se reactiva solo');
select lives_ok('insert into public.offers (job_id, price_cents) values (''10000000-0000-0000-0000-0000000000e7'', 6000)',
  'y vuelve a ofertar');

-- ───────── Corrección con reversal (solo servidor) ─────────
select pg_temp.as_postgres();
set local role service_role;
select is((public.wallet_post_entry(:p, 'reversal', 950, 'reversal:job1', :'job1', 'error de tasa')).balance_after_cents, -2000,
  'un error se corrige con reversal, sin editar el asiento');

-- ───────── Promoción de lanzamiento ─────────
select pg_temp.as_postgres();
update public.settings set value = '10' where key = 'launch_promo_jobs';
select pg_temp.finished(8000) as job3 \gset
select pg_temp.as_user(:c);
select public.confirm_job(:'job3');
select pg_temp.as_postgres();
select is((select sum(amount_cents)::int from public.wallet_entries where job_id = :'job3'), 0,
  'con promoción, la comisión se compensa con promo_credit');

-- ───────── Parámetros ─────────
select pg_temp.as_user(:s, 'support');
update public.settings set value = '1' where key = 'commission_rate_bps';
select pg_temp.as_postgres();
select is((select value::text from public.settings where key = 'commission_rate_bps'), '1000', 'soporte NO cambia la tasa');
select pg_temp.as_user(:s, 'admin');
update public.settings set value = '1100' where key = 'commission_rate_bps';
select pg_temp.as_postgres();
select is((select value::text from public.settings where key = 'commission_rate_bps'), '1100', 'un admin sí');

-- ───────── Calificaciones ─────────
select pg_temp.as_user(:c);
select lives_ok(format('insert into public.ratings (job_id, to_id, stars, tags, comment, payment_method_used) values (%L, %L, 5, %L, %L, %L)',
  :'job1', :p, '{Puntual,"Trabajo limpio"}', 'Excelente', 'yape'), 'el cliente califica y dice cómo pagó');
select is((select status::text from public.jobs where id = :'job1'), 'rated', 'el pedido queda Calificado');
select pg_temp.as_user(:p);
select lives_ok(format('insert into public.ratings (job_id, to_id, stars) values (%L, %L, 5)', :'job1', :c), 'el pro califica al cliente');
select throws_ok(format('insert into public.ratings (job_id, to_id, stars) values (%L, %L, 5)',
  '10000000-0000-0000-0000-0000000000e7', :c), '42501', null, 'no se califica un trabajo sin confirmar');

select * from finish();
rollback;
