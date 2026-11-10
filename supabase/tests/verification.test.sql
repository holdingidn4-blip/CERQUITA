-- Pruebas de la fase 4: registro, envío, revisión y paso a aprobado pleno.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

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

\set p '\'a2000000-0000-0000-0000-000000000000\'::uuid'
\set o '\'b2000000-0000-0000-0000-000000000000\'::uuid'
\set c '\'c2000000-0000-0000-0000-000000000000\'::uuid'
\set s '\'d2000000-0000-0000-0000-000000000000\'::uuid'
insert into auth.users (id, phone, aud, role) values
  (:p, '51988000001', 'authenticated', 'authenticated'),
  (:o, '51988000002', 'authenticated', 'authenticated'),
  (:c, '51988000003', 'authenticated', 'authenticated'),
  (:s, '51988000004', 'authenticated', 'authenticated');

-- Catálogo
select is((select pro_name from public.trades where slug = 'gasfiteria'), 'Gasfitero', 'catálogo con nombre del oficio en persona');
select is((select (value #>> '{}')::int from public.settings where key = 'full_approval_ratings'), 3, 'parámetros en settings desde la migración');

-- ───────── Registro del profesional ─────────
select pg_temp.as_user(:p);
select lives_ok('insert into public.pro_trades (trade_id) select id from public.trades where slug in (''gasfiteria'', ''pintura'')',
  'el pro crea borradores de sus oficios');
select throws_ok('insert into public.pro_trades (trade_id, status) select id, ''approved_full'' from public.trades where slug = ''hogar''',
  '42501', null, 'no puede crear un oficio ya aprobado');
select lives_ok('delete from public.pro_trades where trade_id = (select id from public.trades where slug = ''pintura'')',
  'puede quitar un borrador');
\set gas '(select id from public.pro_trades where pro_id = auth.uid() limit 1)'
select is(public.pro_trade_missing(:gas), array['background', 'dni_back', 'dni_front', 'selfie', 'evidence'],
  'sin documentos le falta todo');
select throws_ok(format('select public.submit_pro_trade(%L)', (select id from public.pro_trades where pro_id = auth.uid())),
  'P0001', null, 'no puede enviar sin evidencia');

insert into public.verification_documents (pro_id, kind, storage_path)
select auth.uid(), k::public.verification_document_kind, auth.uid() || '/' || k || '.jpg'
from unnest(array['dni_front', 'dni_back', 'selfie', 'background']) k;
insert into public.verification_documents (pro_id, pro_trade_id, kind, storage_path)
values (auth.uid(), :gas, 'work_photo', auth.uid() || '/w1.jpg');
select is(public.pro_trade_missing(:gas), array['evidence'], 'con una sola evidencia todavía falta');
insert into public.verification_documents (pro_id, pro_trade_id, kind, storage_path)
values (auth.uid(), :gas, 'certificate', auth.uid() || '/c1.pdf');
select is(public.pro_trade_missing(:gas), '{}'::text[], 'identidad + 2 evidencias completas');
select is((select status::text from public.submit_pro_trade(:gas)), 'submitted', 'envía su oficio');
select throws_ok(format('select public.submit_pro_trade(%L)', (select id from public.pro_trades where pro_id = auth.uid())),
  'P0001', null, 'no puede enviarlo dos veces');
select throws_ok('update public.pro_trades set status = ''approved_full''', '42501', null, 'no cambia el estado directo');
delete from public.pro_trades;  -- RLS solo deja borrar borradores: no falla, no borra
select is((select count(*)::int from public.pro_trades where pro_id = auth.uid()), 1, 'no puede borrar un oficio enviado');
select is((select identity_verified from public.my_verification()), false, 'identidad aún sin verificar');

-- ───────── Aislamiento ─────────
select pg_temp.as_user(:o);
select is((select count(*)::int from public.verification_documents where pro_id = :p), 0, 'otro pro NO ve documentos ajenos');
select throws_ok(format('select public.pro_trade_missing(%L)', (select id from public.pro_trades where pro_id = :p limit 1)),
  'P0002', null, 'ni consulta los faltantes de otro');
select throws_ok(format('select public.submit_pro_trade(%L)', (select id from public.pro_trades where pro_id = :p limit 1)),
  'P0002', null, 'ni envía oficios ajenos');
select throws_ok(format('select public.review_pro_trade(%L, %L)', (select id from public.pro_trades where pro_id = :p limit 1), 'approve'),
  '42501', null, 'un pro no puede revisar');

-- ───────── Revisión ─────────
select pg_temp.as_user(:s, 'reviewer');
\set gasp '(select id from public.pro_trades where pro_id = ''a2000000-0000-0000-0000-000000000000'' limit 1)'
select is((select status::text from public.review_pro_trade(:gasp, 'start')), 'in_review', 'al abrirlo pasa a En revisión');
select throws_ok(format('select public.review_pro_trade(%L, %L, %L)', (select id from public.pro_trades where pro_id = :p limit 1), 'needs_info', '  '),
  '22023', null, 'pedir datos exige motivo');
select is((select status::text from public.review_pro_trade(:gasp, 'needs_info', 'Sube una foto con fecha visible')),
  'needs_info', 'pide más datos con motivo');
select pg_temp.as_user(:p);
select is((select reason from public.pro_trades where pro_id = auth.uid()), 'Sube una foto con fecha visible', 'el pro ve el motivo');
select is((select status::text from public.submit_pro_trade(:gas)), 'submitted', 'reenvía tras completar');
select pg_temp.as_user(:s, 'reviewer');
select is((select status::text from public.review_pro_trade(:gasp, 'approve')), 'approved_observation', 'aprobar deja En observación');
select is((select reviewed_by from public.pro_trades where id = :gasp), :s, 'queda registrado quién revisó');
select pg_temp.as_user(:p);
select is((select identity_verified from public.my_verification()), true, 'identidad verificada tras aprobar');

-- ───────── En observación → pleno (3 calificaciones de 4★ o más) ─────────
select pg_temp.as_postgres();
insert into public.pro_presence (pro_id, online, last_point) values (:p, true, 'SRID=4326;POINT(-77.03 -12.12)');
create function pg_temp.finished_job(p_stars int) returns void
language plpgsql as $$
declare v_job uuid; v_offer uuid;
begin
  insert into public.jobs (client_id, trade_id, description, offered_price_cents, approx_point, exact_address)
  select 'c2000000-0000-0000-0000-000000000000', id, 'Trabajo', 5000, 'SRID=4326;POINT(-77.03 -12.12)', 'Calle 1'
  from public.trades where slug = 'gasfiteria' returning id into v_job;
  insert into public.offers (job_id, pro_id, price_cents, status)
  values (v_job, 'a2000000-0000-0000-0000-000000000000', 5000, 'accepted') returning id into v_offer;
  update public.jobs set status = 'confirmed', accepted_offer_id = v_offer where id = v_job;
  insert into public.ratings (job_id, from_id, to_id, stars)
  values (v_job, 'c2000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000000', p_stars);
end $$;
select pg_temp.finished_job(5);
select pg_temp.finished_job(3);
select is((select good_ratings_count from public.pro_trades where id = :gasp), 1, 'un 3★ no cuenta');
select pg_temp.finished_job(4);
select is((select status::text from public.pro_trades where id = :gasp), 'approved_observation', 'con 2 sigue en observación');
select pg_temp.finished_job(4);
select is((select status::text from public.pro_trades where id = :gasp), 'approved_full', 'con 3 de 4★ o más pasa a pleno');

-- ───────── Rechazo y reintento a los 30 días ─────────
select pg_temp.as_user(:o);
insert into public.pro_trades (trade_id) select id from public.trades where slug = 'hogar';
insert into public.verification_documents (pro_id, pro_trade_id, kind, storage_path)
select auth.uid(), case when k like 'w%' then (select id from public.pro_trades where pro_id = auth.uid()) end,
  (case when k like 'w%' then 'work_photo' else k end)::public.verification_document_kind, auth.uid() || '/' || k || '.jpg'
from unnest(array['dni_front', 'dni_back', 'selfie', 'background', 'w1', 'w2']) k;
select public.submit_pro_trade((select id from public.pro_trades where pro_id = auth.uid()));
select pg_temp.as_user(:s, 'reviewer');
select public.review_pro_trade((select id from public.pro_trades where pro_id = :o), 'reject', 'Documento ilegible');
select pg_temp.as_user(:o);
select throws_like(format('select public.submit_pro_trade(%L)', (select id from public.pro_trades where pro_id = :o)),
  'Podrás volver a enviar este oficio desde el %', 'tras un rechazo espera 30 días');

select * from finish();
rollback;
