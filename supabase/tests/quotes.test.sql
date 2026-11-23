-- F3 · Cotización con desglose, aceptación con versión, fotos, comisión, comprobante, portafolio,
-- cupón por no llegar y apelación.
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);
set local client_min_messages = warning;
delete from public.trade_rate_cards;

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

\set c '\'ae000000-0000-0000-0000-000000000001\'::uuid'
\set p '\'ae000000-0000-0000-0000-000000000002\'::uuid'
\set q '\'ae000000-0000-0000-0000-000000000003\'::uuid'
\set s '\'ae000000-0000-0000-0000-000000000009\'::uuid'
insert into auth.users (id, phone, aud, role) values
  (:c, '51974000001', 'authenticated', 'authenticated'),
  (:p, '51974000002', 'authenticated', 'authenticated'),
  (:q, '51974000003', 'authenticated', 'authenticated'),
  (:s, '51974000009', 'authenticated', 'authenticated');
update public.profiles set full_name = 'Rosa Vargas' where id = :c;
update public.profiles set full_name = 'Carlos Mendoza' where id = :p;
\set gas '(select id from public.trades where slug = ''gasfiteria'')'
insert into public.pro_trades (pro_id, trade_id, status) values (:p, :gas, 'approved_full'), (:q, :gas, 'approved_full');
insert into public.pro_presence (pro_id, online, radius_m, last_point) values
  (:p, true, 3000, 'SRID=4326;POINT(-77.0800 -12.0800)'),
  (:q, true, 3000, 'SRID=4326;POINT(-77.0790 -12.0800)');

select pg_temp.as_user(:c);
insert into public.jobs (trade_id, description, offered_price_cents, approx_point, exact_address)
values (:gas, 'Cambiar caño de la cocina', 9000, 'SRID=4326;POINT(-77.0800 -12.0850)', 'Jr. Los Pinos 245');
select id as job from public.jobs where client_id = auth.uid() \gset

-- ───────── Desglose de la cotización ─────────
select pg_temp.as_user(:p);
select throws_ok(format('insert into public.offers (job_id, price_cents, visit_cents, labor_cents) values (%L, 1, 99999, 5000)', :'job'),
  '22023', null, 'la visita tiene tope (tarifa de visita)');
select throws_ok(format('insert into public.offers (job_id, price_cents, labor_cents, transport_cents) values (%L, 1, 5000, 9999)', :'job'),
  '22023', 'La movilidad no puede pasar de S/ 20.00', 'la movilidad tiene tope');
select throws_ok(format('insert into public.offers (job_id, price_cents, labor_cents) values (%L, 1, 0)', :'job'),
  '22023', 'La mano de obra debe ser de al menos S/ 1', 'la mano de obra es obligatoria');
select lives_ok(format('insert into public.offers (job_id, price_cents, visit_cents, labor_cents, materials_cents, transport_cents) values (%L, 1, 2000, 6000, 1500, 500)', :'job'),
  'cotiza con visita, mano de obra, materiales y movilidad');
select is((select price_cents from public.offers where job_id = :'job' and pro_id = :p), 10000, 'el total lo calcula el servidor');
select pg_temp.as_user(:q);
insert into public.offers (job_id, price_cents) values (:'job', 9500);
select is((select labor_cents || '|' || visit_cents from public.offers where job_id = :'job' and pro_id = :q), '9500|0',
  'sin desglose (app anterior) todo cuenta como mano de obra');

select pg_temp.as_user(:c);
select is((select visit_cents || '|' || labor_cents || '|' || materials_cents || '|' || transport_cents from public.job_offers(:'job') where pro_id = :p),
  '2000|6000|1500|500', 'el cliente ve el desglose de cada oferta');

-- ───────── "Acepto": versión, monto, fecha y términos ─────────
select public.accept_offer((select id from public.offers where job_id = :'job' and pro_id = :p));
select is((select visit_cents || '|' || labor_cents || '|' || materials_cents || '|' || transport_cents || '|' || final_price_cents || '|' || materials_provided_by
  from public.jobs where id = :'job'), '2000|6000|1500|500|10000|pro', 'el pedido guarda los rubros aceptados');
select is((select version || '|' || source || '|' || total_cents || '|' || terms_version from public.quote_acceptances where job_id = :'job'),
  '1|offer|10000|2026-11-23', 'queda la aceptación versión 1 con monto y versión de términos');
select ok((select accepted_by = :c and accepted_at is not null from public.quote_acceptances where job_id = :'job'),
  'con quién aceptó y cuándo');
select pg_temp.as_user(:q);
select is((select count(*)::int from public.quote_acceptances where job_id = :'job'), 0, 'otro pro no ve la aceptación');
select throws_ok(format('insert into public.quote_acceptances (job_id, version, source, visit_cents, labor_cents, materials_cents, transport_cents, total_cents, terms_version, accepted_by) values (%L, 9, %L, 0, 1, 0, 0, 1, %L, %L)', :'job', 'offer', 'x', :c),
  '42501', null, 'nadie escribe aceptaciones a mano');

-- ───────── Servicio: fotos antes / después y precio fijo ─────────
select pg_temp.as_user(:p);
select public.start_trip(:'job');
select pg_temp.as_postgres();
select security_code as code from public.jobs where id = :'job' \gset
select pg_temp.as_user(:p);
select public.arrive(:'job', :'code');
select pg_temp.as_user(:c);
select throws_ok(format($q$insert into public.job_work_photos (job_id, kind, storage_path) values (%L, 'before', %L)$q$, :'job', :'job' || '/c.jpg'),
  '42501', null, 'el cliente no sube fotos del trabajo');
select pg_temp.as_user(:p);
select throws_ok(format('select public.finish_job(%L)', :'job'), 'P0001', 'Sube al menos una foto de antes y una de después del trabajo',
  'sin fotos de antes y después no se termina');
insert into public.job_work_photos (job_id, kind, storage_path) values (:'job', 'before', :'job' || '/antes.jpg');
select lives_ok(format($q$insert into public.job_work_photos (job_id, kind, storage_path) values (%L, 'after', %L)$q$, :'job', :'job' || '/despues.jpg'),
  'el pro sube antes y después en el domicilio');
select throws_ok(format('select public.finish_job(%L, 12000)', :'job'), 'P0001', null, 'no se cambia el precio al terminar');

-- Nueva cotización (reevaluación) = nueva aceptación
select throws_ok(format($q$select public.propose_reevaluation(%L, 7000, 'pro', '[{"name":"Codo","price_cents":2000}]'::jsonb, null)$q$, :'job'),
  '22023', null, 'un material sin cantidad ni precio se rechaza (antes pasaba con total nulo)');
select public.propose_reevaluation(:'job', 7000, 'client', '[]'::jsonb, null);
select pg_temp.as_user(:c);
select public.answer_reevaluation(:'job', true);
select is((select final_price_cents || '|' || quote_version from public.jobs where id = :'job'), '9500|2', 'nuevo total con visita y movilidad: versión 2');
select is((select version || '|' || source || '|' || total_cents from public.quote_acceptances where job_id = :'job' and version = 2),
  '2|reevaluation|9500', 'la nueva cotización tiene su propia aceptación');

select pg_temp.as_user(:p);
select is((select status::text from public.finish_job(:'job')), 'finished', 'con fotos y precio aceptado se termina');

-- ───────── Confirmación: comisión solo sobre la mano de obra ─────────
select pg_temp.as_user(:c);
select public.confirm_job(:'job');
select is((select labor_cents from public.jobs where id = :'job'), 7000, 'mano de obra = total − materiales − visita − movilidad');
select pg_temp.as_postgres();
select is((select -amount_cents from public.wallet_entries where job_id = :'job' and type = 'commission_debit'), 700,
  'comisión 10 % solo de la mano de obra aceptada');

-- ───────── Comprobante ─────────
select pg_temp.as_user(:c);
select is((select (r ->> 'total_cents') || '|' || (r ->> 'labor_cents') || '|' || (r -> 'acceptance' ->> 'version') from public.job_receipt(:'job') r),
  '9500|7000|2', 'el comprobante trae el desglose y la última aceptación');
select pg_temp.as_user(:q);
select is(public.job_receipt(:'job'), null, 'otro no puede pedir el comprobante');

-- ───────── Portafolio con permiso del cliente ─────────
select pg_temp.as_user(:q);
select is((select count(*)::int from public.pro_portfolio(:p)), 0, 'sin permiso, las fotos no van al portafolio');
select pg_temp.as_user(:c);
select is(public.set_portfolio_permission(:'job', true), 2, 'el cliente permite mostrar las fotos');
select pg_temp.as_user(:q);
select is((select count(*)::int from public.pro_portfolio(:p)), 2, 'ahora se ven en el perfil del pro');
select pg_temp.as_user(:c);
select public.set_portfolio_permission(:'job', false);
select pg_temp.as_user(:q);
select is((select count(*)::int from public.pro_portfolio(:p)), 0, 'y puede retirarlas');

-- ───────── Profesional que no llega: cupón y apelación ─────────
select pg_temp.as_user(:c);
insert into public.jobs (trade_id, description, offered_price_cents, approx_point, exact_address)
values (:gas, 'Gotea la ducha', 9000, 'SRID=4326;POINT(-77.0800 -12.0850)', 'Jr. Los Pinos 245');
select id as job2 from public.jobs where client_id = auth.uid() and description = 'Gotea la ducha' \gset
select pg_temp.as_user(:q);
insert into public.offers (job_id, price_cents, labor_cents, eta_minutes) values (:'job2', 1, 9000, 15);
select pg_temp.as_user(:c);
select public.accept_offer((select id from public.offers where job_id = :'job2'));
select pg_temp.as_postgres();
update public.jobs set promised_arrival_at = now() - interval '1 hour' where id = :'job2';
select pg_temp.as_user(:c);
select public.report_no_show(:'job2');
select is((select amount_cents from public.client_coupons where client_id = :c and reason = 'no_show'), 1000,
  'el cliente recibe un cupón de S/ 10 que asume la plataforma');
select pg_temp.as_postgres();
select ok(exists (select 1 from public.notification_outbox where user_id = :q and kind = 'no_show_warning'),
  'el pro recibe una advertencia con la opción de apelar');
select pg_temp.as_user(:q);
select throws_ok(format('select public.appeal_no_show(%L, %L)', (select id from public.pro_no_shows where pro_id = :q), 'corto'),
  '22023', null, 'la apelación explica qué pasó');
select is((select appeal_status from public.appeal_no_show((select id from public.pro_no_shows where pro_id = :q), 'Me chocaron en la avenida Ferrocarril, tengo la denuncia.')),
  'pending', 'apela dentro del plazo');
select pg_temp.as_user(:c);
select throws_ok(format('select public.review_no_show_appeal(%L, true, %L)', (select id from public.pro_no_shows where pro_id = :q), 'ok'),
  '42501', null, 'un cliente no resuelve apelaciones');
select pg_temp.as_user(:s, 'support');
select public.review_no_show_appeal((select id from public.pro_no_shows where pro_id = :q), true, 'Denuncia policial verificada');
select is(private.no_show_count(:q), 0, 'una apelación aceptada ya no cuenta para la pausa');

-- Cupón al confirmar el siguiente servicio: el cliente paga menos y la plataforma se lo abona al pro
select pg_temp.as_postgres();
update public.jobs set status = 'finished', final_proposed_cents = 10000, final_price_cents = 10000, labor_cents = 7500,
  visit_cents = 2000, materials_cents = 0, transport_cents = 500, accepted_offer_id = (select id from public.offers where job_id = :'job' and pro_id = :p),
  commission_rate_bps = 1000, quote_version = 1
where id = :'job2';
select pg_temp.as_user(:c);
select is((select coupon_discount_cents from public.apply_coupon(:'job2', (select id from public.client_coupons where client_id = :c))), 1000,
  'aplica el cupón al confirmar');
select public.confirm_job(:'job2');
select pg_temp.as_postgres();
select is((select amount_cents from public.wallet_entries where job_id = :'job2' and type = 'promo_credit' and idempotency_key like '%:coupon'), 1000,
  'la plataforma le abona al pro el cupón');
select ok((select used_job_id = :'job2'::uuid from public.client_coupons where client_id = :c), 'el cupón queda usado');

select * from finish();
rollback;
