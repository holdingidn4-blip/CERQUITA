-- F2 · Registro del profesional: riesgo, subespecialidades, DNI (+18), video, antecedentes por oficio,
-- historial y cola de revisión.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);
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

\set p '\'ad000000-0000-0000-0000-000000000001\'::uuid'
\set q '\'ad000000-0000-0000-0000-000000000002\'::uuid'
\set s '\'ad000000-0000-0000-0000-000000000009\'::uuid'
insert into auth.users (id, phone, aud, role) values
  (:p, '51973000001', 'authenticated', 'authenticated'),
  (:q, '51973000002', 'authenticated', 'authenticated'),
  (:s, '51973000009', 'authenticated', 'authenticated');

-- ───────── Catálogo ─────────
select is((select string_agg(slug || ':' || risk_level, ',' order by id) from public.trades where slug in ('electricidad', 'limpieza', 'carpinteria')),
  'electricidad:high,carpinteria:skill,limpieza:trust', 'cada oficio tiene su nivel de riesgo');
select ok((select count(*) from public.trade_specialties) >= 27, 'catálogo cerrado de subespecialidades');
select ok(exists (select 1 from public.trade_specialties s join public.trades t on t.id = s.trade_id
  where t.slug = 'electricidad' and s.slug = 'camaras'), 'cámaras con cableado es de electricidad (riesgo alto)');

-- ───────── Datos del DNI ─────────
select pg_temp.as_user(:p);
select throws_ok($$select public.save_pro_identity('1234567', date '1990-01-01')$$, '22023', 'El DNI tiene 8 números', 'DNI de 8 números');
select throws_ok(format('select public.save_pro_identity(%L, %L)', '45678901', ((now() at time zone 'America/Lima')::date - interval '17 years')::date),
  'P0001', 'Debes ser mayor de 18 años para ofrecer servicios en Cerquita', 'menor de 18 no puede registrarse');
select lives_ok(format('select public.save_pro_identity(%L, %L)', '45678901', ((now() at time zone 'America/Lima')::date - interval '18 years')::date),
  'con 18 años cumplidos hoy sí');
select lives_ok($$select public.save_pro_identity('45678901', date '1990-07-15')$$, 'puede corregir su fecha antes de enviar');
select pg_temp.as_user(:q);
select throws_ok($$select public.save_pro_identity('45678901', date '1992-02-02')$$, '23505', null, 'un DNI no se repite en dos cuentas');
select is((select count(*)::int from public.pro_identity), 0, 'otro pro no ve el DNI ajeno');
select pg_temp.as_user(:s, 'reviewer');
select is((select dni_number from public.pro_identity where pro_id = :p), '45678901', 'soporte sí lo ve');

-- ───────── Subespecialidades y requisitos por riesgo ─────────
select pg_temp.as_user(:p);
insert into public.pro_trades (trade_id) select id from public.trades where slug in ('carpinteria', 'electricidad');
\set carp '(select pt.id from public.pro_trades pt join public.trades t on t.id = pt.trade_id where pt.pro_id = ''ad000000-0000-0000-0000-000000000001'' and t.slug = ''carpinteria'')'
\set elec '(select pt.id from public.pro_trades pt join public.trades t on t.id = pt.trade_id where pt.pro_id = ''ad000000-0000-0000-0000-000000000001'' and t.slug = ''electricidad'')'
select throws_ok(format('select public.set_pro_trade_specialties(%L, array[%s]::smallint[])', :carp,
  (select id from public.trade_specialties where slug = 'gas')), '22023', null, 'no acepta una especialidad de otro oficio');
select lives_ok(format('select public.set_pro_trade_specialties(%L, array[%s, %s]::smallint[])', :carp,
  (select id from public.trade_specialties where slug = 'muebles'), (select id from public.trade_specialties where slug = 'reparaciones')),
  'elige sus especialidades de carpintería');
insert into public.verification_documents (pro_id, kind, storage_path)
select auth.uid(), k::public.verification_document_kind, auth.uid() || '/' || k || '.jpg'
from unnest(array['dni_front', 'dni_back', 'selfie', 'background']) k;
select is(public.pro_trade_missing(:carp), array['work_photo', 'verification_video'], 'carpintería (habilidad): faltan fotos y video');
select throws_ok(format($q$insert into public.verification_documents (pro_id, pro_trade_id, kind, storage_path) values (auth.uid(), %L, 'work_photo', 'x/1.jpg')$q$, :carp),
  '22023', 'Cuenta en pocas palabras qué trabajo se ve en la foto', 'en oficios de habilidad cada foto lleva descripción');
insert into public.verification_documents (pro_id, pro_trade_id, kind, storage_path, description)
select auth.uid(), :carp, 'work_photo', auth.uid() || '/c' || n || '.jpg', 'Ropero de melamina ' || n from generate_series(1, 5) n;
select throws_ok(format($q$insert into public.verification_documents (pro_id, pro_trade_id, kind, storage_path, description) values (auth.uid(), %L, 'work_photo', 'x/6.jpg', 'Otra')$q$, :carp),
  'P0001', 'Puedes subir hasta 5 fotos por oficio', 'máximo 5 fotos');
select throws_ok(format($q$insert into public.verification_documents (pro_id, pro_trade_id, kind, storage_path, duration_seconds) values (auth.uid(), %L, 'verification_video', 'x/v.mp4', 30)$q$, :carp),
  '22023', 'El video debe durar entre 1 y 3 minutos', 'el video dura de 1 a 3 minutos');
insert into public.verification_documents (pro_id, pro_trade_id, kind, storage_path, duration_seconds)
values (auth.uid(), :carp, 'verification_video', auth.uid() || '/v.mp4', 150);
select is(public.pro_trade_missing(:carp), '{}'::text[], 'carpintería completa');
select is(public.pro_trade_missing(:elec), array['specialty', 'work_photo', 'certificate', 'verification_video'],
  'electricidad (alto): especialidad, fotos, certificado técnico y video');
select is((select status::text from public.submit_pro_trade(:carp)), 'submitted', 'envía carpintería');
select ok((select submitted_at is not null from public.pro_trades where id = :carp), 'queda la hora de envío');
select throws_ok(format('select public.set_pro_trade_specialties(%L, array[]::smallint[])', :carp),
  'P0001', 'Este oficio ya fue enviado', 'enviado ya no cambia sus especialidades');
select throws_ok($$select public.save_pro_identity('45678901', date '1991-07-15')$$, 'P0001', null,
  'con un oficio en revisión no cambia sus datos del DNI');

-- ───────── Cola y revisión ─────────
select pg_temp.as_user(:q);
select is((select count(*)::int from public.verification_queue()), 0, 'un pro no ve la cola');
select pg_temp.as_postgres();
update public.pro_trades set submitted_at = now() - interval '30 hours' where id = :carp;
select pg_temp.as_user(:s, 'reviewer');
select ok((select overdue from public.verification_queue() where pro_trade_id = :carp), 'más de 24 h esperando: alerta');
select throws_ok(format('select public.review_pro_trade(%L, %L)', :carp, 'approve'),
  '22023', 'Indica el resultado de antecedentes (apto o con restricción)', 'aprobar exige el resultado de antecedentes');
select throws_ok(format('select public.review_pro_trade(%L, %L, null, %L)', :carp, 'approve', 'no_apto'),
  'P0001', null, 'con "no apto" no se aprueba');
select is((select status::text from public.review_pro_trade(:carp, 'approve', null, 'con_restriccion')), 'approved_observation',
  'aprueba con antecedentes "con restricción"');
select is((select result from public.pro_background_checks where pro_trade_id = :carp), 'con_restriccion', 'se guarda solo el resultado');
select is((select count(*)::int from public.verification_documents where pro_id = :p and kind = 'background'), 0,
  'el certificado de antecedentes se borra al decidir');
select is((select string_agg(coalesce(from_status::text, '-') || '>' || to_status::text, ',' order by id) from public.pro_trade_events where pro_trade_id = :carp),
  '->draft,draft>submitted,submitted>approved_observation', 'historial de cada cambio de estado');
select is((select actor_id from public.pro_trade_events where pro_trade_id = :carp and to_status = 'approved_observation'), :s,
  'con el responsable');

-- ───────── El resultado vigente sirve para otro oficio ─────────
select pg_temp.as_user(:p);
select is(public.pro_trade_missing(:elec), array['specialty', 'work_photo', 'certificate', 'verification_video'],
  'electricidad ya no pide antecedentes: hay un resultado vigente');
select pg_temp.as_user(:q);
select is((select count(*)::int from public.pro_background_checks), 0, 'nadie más ve el resultado de antecedentes');

-- ───────── Eliminar cuenta ─────────
select pg_temp.as_user(:p);
select public.delete_my_account();
select pg_temp.as_postgres();
select is((select count(*)::int from public.pro_identity where pro_id = :p) + (select count(*)::int from public.pro_background_checks b
  join public.pro_trades pt on pt.id = b.pro_trade_id where pt.pro_id = :p), 0, 'al eliminar la cuenta se borran DNI y antecedentes');

select * from finish();
rollback;
