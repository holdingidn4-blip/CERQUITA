-- F4 · Capacitaciones: charla, códigos de un solo uso (o QR), cuestionario sin respuestas visibles,
-- certificado y puntos en el libro inmutable.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);
set local client_min_messages = warning;

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

\set c '\'b0000000-0000-0000-0000-000000000001\'::uuid'
\set p '\'b0000000-0000-0000-0000-000000000002\'::uuid'
\set q '\'b0000000-0000-0000-0000-000000000003\'::uuid'
\set s '\'b0000000-0000-0000-0000-000000000009\'::uuid'
insert into auth.users (id, phone, aud, role) values
  (:c, '51976000001', 'authenticated', 'authenticated'),
  (:p, '51976000002', 'authenticated', 'authenticated'),
  (:q, '51976000003', 'authenticated', 'authenticated'),
  (:s, '51976000009', 'authenticated', 'authenticated');
update public.profiles set full_name = 'Carlos Mendoza' where id = :p;
\set gas '(select id from public.trades where slug = ''gasfiteria'')'
insert into public.pro_trades (pro_id, trade_id, status) values (:p, :gas, 'approved_full'), (:q, :gas, 'approved_observation');
\set quiz '\'[{"q":"¿Qué haces antes de tocar un cable?","options":["Nada","Corto la luz","Lo mojo"],"answer":1},{"q":"¿Cómo se paga el trabajo?","options":["Directo al profesional","A Cerquita"],"answer":0},{"q":"¿Dónde hablas con el cliente?","options":["WhatsApp","Llamada","Chat de la app"],"answer":2}]\'::jsonb'

-- ───────── Crear la charla ─────────
select pg_temp.as_user(:c);
select throws_ok(format('select public.create_training(%L, null, %L, null, now(), %L, 100, 70, %L)',
  'huancayo', 'Seguridad eléctrica', 'Local comunal', :quiz), '42501', null, 'un usuario común no crea charlas');
select pg_temp.as_user(:s, 'support');
select throws_ok(format('select public.create_training(%L, null, %L, null, now(), %L, 100, 70, %L)',
  'huancayo', 'Seguridad eléctrica', 'Local comunal', '[{"q":"¿Sí?","options":["Sí"],"answer":0}]'), '22023', null,
  'el cuestionario necesita al menos 2 opciones por pregunta');
select id as tr from public.create_training('huancayo', :gas, 'Seguridad eléctrica en casa', 'Charla práctica',
  now(), 'Local comunal de El Tambo', 100, 70, :quiz) \gset
select is((select count(*)::int from public.create_training_codes(:'tr', 5)), 5, 'soporte genera 5 códigos');
select is((select count(*)::int from public.training_codes where training_id = :'tr' and code ~ '^[A-HJ-NP-Z2-9]{8}$'), 5,
  'códigos de 8 caracteres sin 0/O/1/I');
select code as code1 from public.training_codes where training_id = :'tr' order by code limit 1 \gset
select code as code2 from public.training_codes where training_id = :'tr' order by code offset 1 limit 1 \gset

select pg_temp.as_user(:p);
select is((select title from public.trainings where id = :'tr'), 'Seguridad eléctrica en casa', 'el pro ve la charla');
select throws_ok(format('select quiz from public.trainings where id = %L', :'tr'), '42501', null,
  'pero no las respuestas del cuestionario');
select is((select count(*)::int from public.training_codes), 0, 'ni los códigos');

-- ───────── Asistencia con código o QR ─────────
select pg_temp.as_user(:c);
select throws_ok(format('select public.redeem_training_code(%L)', :'code1'), '42501', null, 'solo para profesionales');
select pg_temp.as_user(:p);
select throws_ok($$ select public.redeem_training_code('ZZZZZZZZ') $$, 'P0002', null, 'un código inventado no vale');
select is((select training_id from public.redeem_training_code('cerquita:capacitacion:' || lower(:'code1'))), :'tr'::uuid,
  'registra su asistencia con el QR (o el código, sin importar mayúsculas)');
select throws_ok(format('select public.redeem_training_code(%L)', :'code2'), 'P0001',
  'Ya registraste tu asistencia a esta charla', 'una sola asistencia por charla');
select pg_temp.as_user(:q);
select throws_ok(format('select public.redeem_training_code(%L)', :'code1'), 'P0001',
  'Este código ya se usó. Pide otro al organizador.', 'el código es de un solo uso');

-- ───────── Cuestionario ─────────
select is(jsonb_array_length(public.training_quiz(:'tr')), 0, 'sin asistencia no ve el cuestionario');
select pg_temp.as_user(:p);
select is((select count(*)::int from jsonb_array_elements(public.training_quiz(:'tr')) e where e ? 'answer'), 0,
  'el cuestionario llega sin las respuestas');
select is(jsonb_array_length(public.training_quiz(:'tr')), 3, 'con sus 3 preguntas');
select throws_ok(format('select * from public.submit_training_quiz(%L, %L)', :'tr', '{1,0}'), '22023', null,
  'hay que responder todas');
select is((select score || '|' || passed || '|' || attempts_left || '|' || points from public.submit_training_quiz(:'tr', '{1,1,1}')),
  '33|false|2|0', 'desaprobado: 33 %, sin puntos, le quedan 2 intentos');
select matches((select certificate_no from public.submit_training_quiz(:'tr', '{1,0,2}')), '^CQ-[0-9]{4}-[0-9]{5}$',
  'aprobado: recibe su certificado');
select is((select sum(points)::int from public.pro_points_entries where kind = 'training'), 100,
  'y 100 puntos en su libro');
select throws_ok(format('select * from public.submit_training_quiz(%L, %L)', :'tr', '{1,0,2}'), 'P0001', null,
  'no se aprueba dos veces (no duplica puntos)');
select is((select points from public.my_reputation()), 100, 'los puntos cuentan para su nivel');
select certificate_no as cert from public.training_attendance where pro_id = :p \gset
select is((select pro_name from public.training_certificate(:'cert')), 'Carlos Mendoza', 've su certificado');
select pg_temp.as_user(:q);
select is((select count(*)::int from public.training_certificate(:'cert')), 0, 'otro profesional no lo ve');
select pg_temp.as_user(:s, 'reviewer');
select is((select score from public.training_certificate(:'cert')), 100, 'soporte lo verifica por número');

-- ───────── Ventana, intentos y cancelación ─────────
select pg_temp.as_user(:s, 'support');
select id as tr2 from public.create_training('huancayo', null, 'Atención al cliente', null,
  now() + interval '3 days', 'Municipalidad', 50, 100, :quiz) \gset
select code as code3 from public.create_training_codes(:'tr2', 1) \gset
select pg_temp.as_user(:q);
select throws_ok(format('select public.redeem_training_code(%L)', :'code3'), 'P0001',
  'El código solo vale el día de la charla', 'el código vale solo el día de la charla');
select pg_temp.as_postgres();
update public.trainings set starts_at = now() where id = :'tr2';
select pg_temp.as_user(:q);
select public.redeem_training_code(:'code3');
select public.submit_training_quiz(:'tr2', '{0,0,0}');
select public.submit_training_quiz(:'tr2', '{0,0,0}');
select public.submit_training_quiz(:'tr2', '{0,0,0}');
select throws_ok(format('select * from public.submit_training_quiz(%L, %L)', :'tr2', '{1,0,2}'), 'P0001',
  'Ya usaste tus 3 intentos. Escríbenos desde Ayuda.', 'máximo 3 intentos');

select pg_temp.as_user(:s, 'support');
select code as code4 from public.create_training_codes(:'tr', 1) \gset
select public.cancel_training(:'tr');
select pg_temp.as_user(:q);
select throws_ok(format('select public.redeem_training_code(%L)', :'code4'), 'P0001',
  'Esta capacitación se canceló', 'una charla cancelada no registra asistencia');
select pg_temp.as_postgres();
select is((select sum(points)::int from public.pro_points_entries where pro_id = :p), 100,
  'cancelar no toca los puntos ya ganados');

select * from finish();
rollback;
