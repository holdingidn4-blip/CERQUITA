-- Pruebas del piloto Huancayo: categorías, requisitos, tarifario, materiales sin comisión,
-- reevaluación en sitio, tarifa de visita y detección de bypass por GPS.
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);
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

\set c '\'a7000000-0000-0000-0000-000000000000\'::uuid'
\set p '\'b7000000-0000-0000-0000-000000000000\'::uuid'
\set d '\'c7000000-0000-0000-0000-000000000000\'::uuid'
\set s '\'d7000000-0000-0000-0000-000000000000\'::uuid'
insert into auth.users (id, phone, aud, role) values
  (:c, '51933000001', 'authenticated', 'authenticated'),
  (:p, '51933000002', 'authenticated', 'authenticated'),
  (:d, '51933000003', 'authenticated', 'authenticated'),
  (:s, '51933000004', 'authenticated', 'authenticated');
\set gas '(select id from public.trades where slug = ''gasfiteria'')'
\set chofer '(select id from public.trades where slug = ''chofer'')'
\set limpieza '(select id from public.trades where slug = ''limpieza'')'

-- ───────── Ciudad, moneda y categorías ─────────
select is(private.active_city(), 'huancayo', 'la ciudad activa del piloto es Huancayo');
select is(private.setting_text('currency_code', 'XXX'), 'PEN', 'la moneda de Huancayo es PEN');
select pg_temp.as_postgres();
insert into public.settings (key, scope, value) values ('commission_rate_bps', 'city:huancayo', '1200');
select is(private.setting_int('commission_rate_bps', 0), 1200, 'un parámetro de ciudad tiene prioridad sobre el global');
delete from public.settings where key = 'commission_rate_bps' and scope = 'city:huancayo';
select is((select array_agg(distinct category::text order by category::text) from public.trades),
  array['construction', 'domestic', 'driver', 'technical'], 'existen las 4 categorías');
select is((select category::text || '|' || pricing_unit from public.trades where slug = 'chofer'), 'driver|hour', 'chofer: categoría driver, cobra por hora');
select is((select category::text || '|' || pricing_unit from public.trades where slug = 'cuidado'), 'domestic|day', 'cuidado: domestic, por día');
select is((select category::text from public.trades where slug = 'albanileria'), 'construction', 'albañilería es construcción');

-- ───────── Requisitos por categoría ─────────
select pg_temp.as_user(:d);
insert into public.pro_trades (trade_id) select id from public.trades where slug in ('chofer', 'limpieza');
insert into public.verification_documents (pro_id, kind, storage_path)
select auth.uid(), k::public.verification_document_kind, auth.uid() || '/' || k || '.jpg'
from unnest(array['dni_front', 'dni_back', 'selfie', 'background']) k;
\set ptchofer '(select id from public.pro_trades where pro_id = auth.uid() and trade_id = (select id from public.trades where slug = ''chofer''))'
\set ptlimp '(select id from public.pro_trades where pro_id = auth.uid() and trade_id = (select id from public.trades where slug = ''limpieza''))'
select is(public.pro_trade_missing(:ptchofer), array['driver_license', 'driver_record'], 'chofer: pide licencia y récord MTC/SAT');
select is(public.pro_trade_missing(:ptlimp), array['police_record', 'criminal_record', 'reference'],
  'servidumbre: pide antecedentes policiales, penales y referencias');
insert into public.verification_documents (pro_id, pro_trade_id, kind, storage_path) values
  (auth.uid(), :ptchofer, 'driver_license', auth.uid() || '/lic.jpg'),
  (auth.uid(), :ptchofer, 'driver_record', auth.uid() || '/mtc.pdf');
select is(public.pro_trade_missing(:ptchofer), '{}'::text[], 'con licencia y récord está completo');
select throws_ok(format('select public.submit_pro_trade(%L)', (select id from public.pro_trades where pro_id = auth.uid() and trade_id = (select id from public.trades where slug = 'limpieza'))),
  'P0001', null, 'servidumbre no se envía sin antecedentes ni referencias');
insert into public.verification_documents (pro_id, pro_trade_id, kind, storage_path) values
  (auth.uid(), :ptlimp, 'police_record', auth.uid() || '/pol.pdf'),
  (auth.uid(), :ptlimp, 'criminal_record', auth.uid() || '/pen.pdf'),
  (auth.uid(), :ptlimp, 'reference', auth.uid() || '/ref1.jpg');
select is(public.pro_trade_missing(:ptlimp), array['reference'], 'con una sola referencia aún falta (mínimo 2)');
select is((select array_agg(requirement order by requirement) from public.trade_requirements(:gas)), array['evidence'],
  'técnicos: evidencias del oficio');

-- ───────── Tarifario (sin regateo) ─────────
select pg_temp.as_postgres();
insert into public.trade_rate_cards (trade_id, unit, label, min_cents, suggested_cents, max_cents, visit_fee_cents)
select id, 'job', 'Reparación de gasfitería', 3000, 8000, 20000, 2500 from public.trades where slug = 'gasfiteria';
insert into public.trade_rate_cards (trade_id, unit, label, min_cents, suggested_cents, max_cents)
select id, 'hour', 'Hora de limpieza', 1000, 1200, 1800 from public.trades where slug = 'limpieza';
insert into public.pro_trades (pro_id, trade_id, status) values (:p, :gas, 'approved_full');
insert into public.pro_trades (pro_id, trade_id, status) select :p, id, 'approved_full' from public.trades where slug = 'limpieza';
insert into public.pro_presence (pro_id, online, radius_m, last_point) values (:p, true, 5000, 'SRID=4326;POINT(-75.2049 -12.0651)');
select pg_temp.as_user(:c);
select throws_ok(format('insert into public.jobs (trade_id, description, offered_price_cents, approx_point, exact_address) values (%s, %L, 1500, %L, %L)',
  (select id from public.trades where slug = 'gasfiteria'), 'Fuga', 'SRID=4326;POINT(-75.2049 -12.0651)', 'Jr. Real 100'),
  'P0001', null, 'no se publica por debajo del mínimo del tarifario');
select lives_ok(format('insert into public.jobs (trade_id, description, offered_price_cents, approx_point, exact_address, units) values (%s, %L, 4800, %L, %L, 4)',
  (select id from public.trades where slug = 'limpieza'), 'Limpieza general', 'SRID=4326;POINT(-75.2049 -12.0651)', 'Jr. Real 100'),
  'limpieza por 4 horas a S/ 12/h');
select is((select pricing_unit::text || '|' || units || '|' || city_slug || '|' || currency_code from public.jobs where description = 'Limpieza general'),
  'hour|4|huancayo|PEN', 'el pedido guarda unidad, horas, ciudad y moneda');
select pg_temp.as_user(:p);
select throws_ok(format('insert into public.offers (job_id, price_cents) values (%L, 9000)', (select id from public.nearby_jobs() where pricing_unit = 'hour')),
  'P0001', null, 'una oferta sobre el máximo × horas se rechaza (S/ 90 > 4 × S/ 18)');
select lives_ok(format('insert into public.offers (job_id, price_cents) values (%L, 5600)', (select id from public.nearby_jobs() where pricing_unit = 'hour')),
  'una oferta dentro del tarifario pasa (4 × S/ 14)');

-- ───────── Servicio con reevaluación y materiales ─────────
select pg_temp.as_user(:c);
insert into public.jobs (trade_id, description, offered_price_cents, approx_point, exact_address)
select id, 'Cambio de caño', 8000, 'SRID=4326;POINT(-75.2049 -12.0651)', 'Jr. Real 200' from public.trades where slug = 'gasfiteria';
select id as job from public.jobs where description = 'Cambio de caño' \gset
select pg_temp.as_user(:p);
insert into public.offers (job_id, price_cents) values (:'job', 8000);
select pg_temp.as_user(:c);
select public.accept_offer((select id from public.offers where job_id = :'job'));
select is((select labor_cents || '|' || materials_cents || '|' || total_cents from public.jobs where id = :'job'), '8000|0|8000',
  'al aceptar: todo es mano de obra');
select pg_temp.as_postgres();
update public.jobs set status = 'at_home' where id = :'job';

select pg_temp.as_user(:c);
select throws_ok(format('select public.propose_reevaluation(%L, 9000, %L)', :'job', 'pro'), '42501', null, 'el cliente no reevalúa');
select pg_temp.as_user(:p);
select throws_ok(format('select public.propose_reevaluation(%L, 9000, %L, %L)', :'job', 'client', '[{"name":"Llave","qty":1,"unit_cents":2000}]'),
  '22023', null, 'si el cliente pone los materiales, no se cobran materiales');
select throws_like(format('select public.propose_reevaluation(%L, 9000, %L, %L)', :'job', 'pro', '[{"name":"Llave Vainsa","qty":2,"unit_cents":1590}]'),
  'Sube la foto de la boleta%', 'si el pro compra materiales, debe subir la boleta');
select throws_ok(format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, auth.uid()::text)', 'material-receipts', 'otro-pedido/b.jpg'),
  '42501', null, 'la boleta solo va en la carpeta de su pedido');
insert into storage.objects (bucket_id, name, owner_id) values ('material-receipts', :'job' || '/boleta.jpg', auth.uid()::text);
select is((select reeval_materials_cents from public.propose_reevaluation(:'job', 9000, 'pro',
  '[{"name":"Llave Vainsa","qty":2,"unit_cents":1590},{"name":"Cinta teflón","qty":1,"unit_cents":350}]', :'job' || '/boleta.jpg')),
  3530, 'propone S/ 90 de mano de obra + S/ 35.30 de materiales (calculado en el servidor)');
select pg_temp.as_user(:c);
select is((select count(*)::int from storage.objects where bucket_id = 'material-receipts'), 1, 'el cliente ve la boleta');
select is((select status::text from public.answer_reevaluation(:'job', true)), 'price_renegotiated', 'el cliente aprueba: precio reevaluado');
select is((select labor_cents || '|' || materials_cents || '|' || total_cents || '|' || final_price_cents from public.jobs where id = :'job'),
  '9000|3530|12530|12530', 'el pedido queda con el desglose y el total nuevo');
select pg_temp.as_user(:p);
select lives_ok(format('insert into public.job_tracks (job_id, point) values (%L, %L)', :'job', 'SRID=4326;POINT(-75.2049 -12.0651)'),
  'con precio reevaluado sigue en el domicilio (ubicación activa)');
select is((select status::text from public.finish_job(:'job')), 'finished', 'el pro marca Terminado');
select pg_temp.as_user(:c);
select public.confirm_job(:'job');
select pg_temp.as_postgres();
select is((select amount_cents from public.wallet_entries where idempotency_key = 'job:' || :'job' || ':commission'), -900,
  'comisión 10 % SOLO sobre la mano de obra: S/ 9.00 (los S/ 35.30 de materiales quedan exentos)');

-- Rechazo de reevaluación + cancelación con tarifa de visita.
select pg_temp.as_user(:c);
insert into public.jobs (trade_id, description, offered_price_cents, approx_point, exact_address)
select id, 'Revisión de terma', 8000, 'SRID=4326;POINT(-75.2049 -12.0651)', 'Jr. Real 300' from public.trades where slug = 'gasfiteria';
select id as job2 from public.jobs where description = 'Revisión de terma' \gset
select pg_temp.as_user(:p);
insert into public.offers (job_id, price_cents) values (:'job2', 8000);
select pg_temp.as_user(:c);
select public.accept_offer((select id from public.offers where job_id = :'job2'));
select pg_temp.as_postgres();
update public.jobs set status = 'at_home' where id = :'job2';
select pg_temp.as_user(:p);
select public.propose_reevaluation(:'job2', 15000, 'client');
select pg_temp.as_user(:c);
select is((select status::text from public.answer_reevaluation(:'job2', false)), 'at_home', 'el cliente rechaza la reevaluación');
select is((select visit_fee_cents from public.cancel_service(:'job2', 'No acepto el nuevo precio')), 2500,
  'si cancela tras la llegada, debe la tarifa de visita del tarifario (S/ 25)');
select pg_temp.as_postgres();
select is((select amount_cents from public.wallet_entries where idempotency_key = 'job:' || :'job2' || ':visit'), -250,
  'y Cerquita anota su comisión sobre la visita (10 % = S/ 2.50)');

-- Cancelar ANTES de llegar no genera tarifa.
select pg_temp.as_user(:c);
insert into public.jobs (trade_id, description, offered_price_cents, approx_point, exact_address)
select id, 'Destape', 8000, 'SRID=4326;POINT(-75.2049 -12.0651)', 'Jr. Real 400' from public.trades where slug = 'gasfiteria';
select id as job3 from public.jobs where description = 'Destape' \gset
select pg_temp.as_user(:p);
insert into public.offers (job_id, price_cents) values (:'job3', 8000);
select pg_temp.as_user(:c);
select public.accept_offer((select id from public.offers where job_id = :'job3'));
select is((select visit_fee_cents from public.cancel_service(:'job3', 'Ya no lo necesito')), null, 'cancelar antes de la llegada no cobra visita');

-- ───────── Antifraude: bypass por GPS ─────────
select pg_temp.as_postgres();
select ok(not exists (select 1 from public.bypass_suspicions), 'sin datos de GPS no hay sospecha');
-- El pro sigue en el domicilio del pedido cancelado (job2): lo cancelaron hace 20 min y no se movió.
-- (updated_at lo pone el trigger = ahora; se retrocede la hora de cancelación.)
update public.jobs set cancelled_at = now() - interval '20 minutes' where id = :'job2';
update public.pro_presence set online = true, last_point = 'SRID=4326;POINT(-75.2049 -12.0651)',
  still_since = now() - interval '50 minutes' where pro_id = :p;
select is(private.detect_bypass(now()), 1, 'pedido cancelado + 20 min en el domicilio = sospecha de bypass');
select is((select minutes_on_site from public.bypass_suspicions where job_id = :'job2'), 20, 'con los minutos en el lugar');
select is(private.detect_bypass(now()), 0, 'no se duplica');
select is((select count(*)::int from public.pro_trades where pro_id = :p and status = 'suspended'), 0, 'una sospecha no suspende');
-- Segunda sospecha en la semana (job3) → suspensión.
update public.jobs set cancelled_at = now() - interval '16 minutes' where id = :'job3';
select is(private.detect_bypass(now()), 1, 'segunda sospecha en la semana');
select is((select count(*)::int from public.pro_trades where pro_id = :p and status = 'suspended'), 2,
  '2 sospechas en 7 días suspenden sus oficios');
select pg_temp.as_user(:p);
select is((select count(*)::int from public.bypass_suspicions), 0, 'el pro no ve las sospechas');
select throws_ok(format('select public.review_bypass(%L, false, %L)', (select gen_random_uuid()), 'x'), '42501', null, 'ni las revisa');
select pg_temp.as_user(:s, 'support');
select is((select count(*)::int from public.bypass_queue()), 2, 'soporte ve la cola de sospechas');
select is((select status::text from public.review_bypass((select id from public.bypass_suspicions where job_id = :'job3'), false, 'Vecino del cliente')),
  'dismissed', 'soporte descarta una');
select pg_temp.as_postgres();
select is((select count(*)::int from public.pro_trades where pro_id = :p and status = 'approved_observation'), 2,
  'al quedar bajo el máximo se levanta la suspensión (vuelve a observación)');

select * from finish();
rollback;
