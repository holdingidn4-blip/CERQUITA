-- F4 · Reputación y confianza: calificación visible desde un mínimo, niveles, puntos inmutables del pro,
-- lista negra (perfil, DNI y dispositivo) con apelación humana, y primer trabajo supervisado.
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);
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

\set c '\'af000000-0000-0000-0000-000000000001\'::uuid'
\set p '\'af000000-0000-0000-0000-000000000002\'::uuid'
\set q '\'af000000-0000-0000-0000-000000000003\'::uuid'
\set d '\'af000000-0000-0000-0000-000000000004\'::uuid'
\set e '\'af000000-0000-0000-0000-000000000005\'::uuid'
\set s '\'af000000-0000-0000-0000-000000000009\'::uuid'
insert into auth.users (id, phone, aud, role) values
  (:c, '51975000001', 'authenticated', 'authenticated'),
  (:p, '51975000002', 'authenticated', 'authenticated'),
  (:q, '51975000003', 'authenticated', 'authenticated'),
  (:d, '51975000004', 'authenticated', 'authenticated'),
  (:e, '51975000005', 'authenticated', 'authenticated'),
  (:s, '51975000009', 'authenticated', 'authenticated');
update public.profiles set full_name = 'Rosa Vargas' where id = :c;
update public.profiles set full_name = 'Carlos Mendoza' where id = :p;
update public.profiles set full_name = 'Juan Pérez' where id = :q;
\set gas '(select id from public.trades where slug = ''gasfiteria'')'
\set skill '(select id from public.trades where risk_level = ''skill'' order by id limit 1)'
insert into public.pro_trades (pro_id, trade_id, status) values
  (:p, :gas, 'approved_full'), (:q, :gas, 'approved_observation'), (:q, :skill, 'approved_observation');
insert into public.pro_identity (pro_id, dni_number, birth_date) values (:p, '41234567', '1985-05-10');

-- Trabajo confirmado con calificación (directo en la base).
create function pg_temp.done_job(p_pro uuid, p_stars int) returns uuid
language plpgsql as $$
declare v_job uuid; v_offer uuid;
begin
  insert into public.jobs (client_id, trade_id, description, offered_price_cents, approx_point, exact_address)
  select 'af000000-0000-0000-0000-000000000001', id, 'Trabajo hecho', 5000, 'SRID=4326;POINT(-77.03 -12.12)', 'Calle 1'
  from public.trades where slug = 'gasfiteria' returning id into v_job;
  insert into public.offers (job_id, pro_id, price_cents, status) values (v_job, p_pro, 5000, 'accepted')
  returning id into v_offer;
  update public.jobs set status = 'confirmed', accepted_offer_id = v_offer where id = v_job;
  insert into public.ratings (job_id, from_id, to_id, stars)
  values (v_job, 'af000000-0000-0000-0000-000000000001', p_pro, p_stars);
  return v_job;
end $$;
-- Pedido publicado con una oferta pendiente del pro.
create function pg_temp.open_job(p_pro uuid, p_trade smallint, p_price int) returns uuid
language plpgsql as $$
declare v_job uuid;
begin
  insert into public.jobs (client_id, trade_id, description, offered_price_cents, approx_point, exact_address)
  values ('af000000-0000-0000-0000-000000000001', p_trade, 'Arreglar la terma', p_price,
    'SRID=4326;POINT(-77.03 -12.12)', 'Calle 2') returning id into v_job;
  insert into public.offers (job_id, pro_id, price_cents) values (v_job, p_pro, p_price);
  return v_job;
end $$;

-- ───────── Calificación visible desde el mínimo ─────────
select pg_temp.done_job(:p, 5);
select pg_temp.done_job(:p, 4);
select pg_temp.as_user(:c);
select is((select rating_avg from public.pro_profile(:p)), null, 'con 2 calificaciones el promedio no se muestra');
select is((select ratings_count from public.pro_profile(:p)), 2, 'pero sí cuántas tiene');
select pg_temp.as_postgres();
select pg_temp.done_job(:p, 4);
select pg_temp.as_user(:c);
select is((select rating_avg from public.pro_profile(:p)), 4.3, 'desde 3 calificaciones se muestra el promedio');

-- ───────── Niveles ─────────
select pg_temp.as_user(:p);
select is((select level from public.my_reputation()), 'verificado', '3 trabajos confirmados: verificado');
select is((select next_level || '|' || next_at from public.my_reputation()), 'confianza|15', 'y le dice cuánto falta para "de confianza"');
select pg_temp.as_user(:q);
select is((select level from public.my_reputation()), 'nuevo', 'sin trabajos: nuevo');
select pg_temp.as_postgres();
select private.pro_points_post(:p, 'training', 600, 'test:capacitacion', 'Charla de seguridad');
select private.pro_points_post(:p, 'training', 600, 'test:capacitacion', 'Charla de seguridad');
select is((select count(*)::int from public.pro_points_entries where pro_id = :p), 1, 'los puntos se anotan una sola vez por clave');
select pg_temp.as_user(:p);
select is((select level || '|' || progress || '|' || points from public.my_reputation()), 'confianza|15|600',
  'los puntos de capacitación suben de nivel: 3 trabajos + 600 pts = de confianza');
select pg_temp.as_postgres();
insert into public.claims (job_id, client_id, pro_id, description, status)
values ((select id from public.jobs where client_id = :c order by created_at limit 1), :c, :p, 'No terminó el trabajo acordado', 'resolved');
select pg_temp.as_user(:p);
select is((select level || '|' || complaints from public.my_reputation()), 'verificado|1',
  'una queja confirmada lo deja en verificado');
select pg_temp.as_postgres();
update public.claims set status = 'rejected' where pro_id = :p;

-- Prioridad: el nivel alto aparece primero aunque cobre más.
select pg_temp.open_job(:q, :gas, 6000) as job \gset
insert into public.offers (job_id, pro_id, price_cents) values (:'job', :p, 8000);
select pg_temp.as_user(:c);
select is((select array_agg(level order by ord) from (
    select level, row_number() over () as ord from public.job_offers(:'job')) x),
  array['confianza', 'nuevo'], 'las ofertas muestran el nivel y el de mayor nivel va primero');

-- El libro de puntos es inmutable para los usuarios.
select pg_temp.as_user(:p);
select throws_ok($$ update public.pro_points_entries set points = 9999 $$, '42501', null, 'el pro no edita sus puntos');
select throws_ok($$ insert into public.pro_points_entries (pro_id, kind, points, idempotency_key) values (auth.uid(), 'training', 5, 'x') $$,
  '42501', null, 'ni se los anota');
select is((select count(*)::int from public.pro_points_entries), 1, 've sus propios puntos');
select pg_temp.as_user(:c);
select is((select count(*)::int from public.pro_points_entries), 0, 'otro usuario no los ve');

-- ───────── Dispositivos y lista negra ─────────
select pg_temp.as_user(:p);
select lives_ok($$ select public.register_device('android-id-carlos-123') $$, 'el teléfono registra su dispositivo');
select pg_temp.as_postgres();
select is((select device_hash from public.user_devices where user_id = :p),
  encode(sha256(convert_to('android-id-carlos-123', 'UTF8')), 'hex'), 'solo se guarda el hash del dispositivo');
select pg_temp.as_user(:c);
select is((select count(*)::int from public.user_devices), 0, 'los usuarios no ven dispositivos');
select throws_ok($$ select public.admin_blacklist_person('af000000-0000-0000-0000-000000000002', 'Cobra por fuera', 30) $$,
  '42501', null, 'un usuario común no agrega a la lista negra');
select pg_temp.as_user(:s, 'reviewer');
select throws_ok($$ select public.admin_blacklist_person('af000000-0000-0000-0000-000000000002', 'Cobra por fuera', 30) $$,
  '42501', null, 'la revisora tampoco');
select pg_temp.as_postgres();
select pg_temp.open_job(:q, :gas, 5000) as job4 \gset
select pg_temp.as_user(:s, 'support');
select throws_ok($$ select public.admin_blacklist_person('af000000-0000-0000-0000-000000000002', 'mal', 30) $$,
  '22023', null, 'el motivo es obligatorio');
select id as bl from public.admin_blacklist_person(:p, 'Cobró por fuera de la app a dos clientes', 30) \gset
select is((select dni_number || '|' || cardinality(device_hashes) || '|' || (until between now() + interval '29 days' and now() + interval '31 days')
  from public.blacklist_entries where profile_id = :p), '41234567|1|true',
  'soporte lo agrega con motivo, plazo de 30 días, su DNI y su dispositivo');
select pg_temp.as_postgres();
select is((select count(*)::int from public.admin_actions where action = 'blacklist_add' and target_user = :p), 1,
  'queda en la auditoría');
select throws_ok(format('insert into public.offers (job_id, pro_id, price_cents) values (%L, %L, 5000)', :'job4', :p),
  '42501', 'Tu cuenta tiene una restricción. Revisa Ajustes → Restricción para ver el motivo y apelar.',
  'con restricción no puede cotizar');
select pg_temp.as_user(:p);
select is((select reason from public.my_restriction()), 'Cobró por fuera de la app a dos clientes', 've su motivo');
select pg_temp.as_postgres();
-- Cuenta nueva en el mismo teléfono.
select pg_temp.as_user(:d);
select public.register_device('android-id-carlos-123');
select pg_temp.as_postgres();
select throws_ok($$ insert into public.jobs (client_id, trade_id, description, offered_price_cents, approx_point, exact_address)
    select 'af000000-0000-0000-0000-000000000004', id, 'Pedido nuevo', 5000, 'SRID=4326;POINT(-77.03 -12.12)', 'Calle 3'
    from public.trades where slug = 'gasfiteria' $$,
  '42501', null, 'otra cuenta en el mismo dispositivo tampoco puede pedir');
-- La cuenta se borró y alguien intenta registrarse con el mismo DNI.
delete from public.pro_identity where pro_id = :p;
select pg_temp.as_user(:e);
select throws_ok($$ select public.save_pro_identity('41234567', '1985-05-10') $$, '42501',
  'Este DNI tiene una restricción en Cerquita. Escríbenos desde Ayuda si crees que es un error.',
  'el mismo DNI en otra cuenta queda bloqueado');

-- Apelación humana.
select pg_temp.as_user(:p);
select throws_ok(format('select public.appeal_blacklist(%L, %L)', :'bl', 'corto'), '22023', null, 'la apelación necesita explicación');
select lives_ok(format('select public.appeal_blacklist(%L, %L)', :'bl', 'El cliente pidió pagar en efectivo, no fue por fuera.'), 'apela con su explicación');
select throws_ok(format('select public.appeal_blacklist(%L, %L)', :'bl', 'Insisto en que fue un malentendido.'), 'P0001', null, 'solo una vez');
select pg_temp.as_user(:s, 'support');
select is((select appeal_status from public.review_blacklist_appeal(:'bl', true, 'Revisamos el chat: tenía razón.')), 'accepted',
  'una persona de soporte acepta la apelación');
select pg_temp.as_postgres();
select is(private.is_blacklisted(:p) or private.is_blacklisted(:d), false, 'la restricción deja de valer para él y para su dispositivo');
select pg_temp.as_user(:p);
select is((select appeal_status from public.my_restriction()), 'accepted', 've que su apelación fue aceptada');

-- Levantar una restricción.
select pg_temp.as_user(:s, 'support');
select id as bl2 from public.admin_blacklist_person(:c, 'Amenazó a un profesional', null) \gset
select is((select until from public.blacklist_entries where id = :'bl2'), null, 'sin plazo: indefinida');
select lives_ok(format('select public.admin_lift_blacklist(%L, %L)', :'bl2', 'Se aclaró con ambas partes.'), 'soporte la levanta con nota');
select pg_temp.as_postgres();
select is(private.is_blacklisted(:c), false, 'levantada, ya no restringe');

-- ───────── Primer trabajo supervisado y muestreo ─────────
select pg_temp.as_user(:c);
select public.accept_offer((select id from public.offers where job_id = :'job' and pro_id = :q));
select pg_temp.as_postgres();
select is((select reason || '|' || status from public.job_supervisions where job_id = :'job'), 'first_job|pending',
  'el primer trabajo del pro queda supervisado');
select pg_temp.as_user(:q);
select is((select count(*)::int from public.job_supervisions), 1, 'el pro ve que está supervisado');
select pg_temp.as_user(:s, 'support');
select throws_ok(format('select public.review_supervision(%L, true, true, true, true, null)',
  (select id from public.job_supervisions where job_id = :'job')), 'P0001', null, 'se revisa cuando el trabajo termina');
select pg_temp.as_postgres();
update public.jobs set status = 'finished' where id = :'job';
select pg_temp.as_user(:s, 'support');
select throws_ok(format('select public.review_supervision(%L, true, false, true, true, null)',
  (select id from public.job_supervisions where job_id = :'job')), '22023', null, 'si algo falló, hay que describirlo');
select is((select status from public.review_supervision(
    (select id from public.job_supervisions where job_id = :'job'), true, false, true, true, 'Dejó sucio el baño.')),
  'issues', 'checklist de llegada, trato, alcance y seguridad: con una falla queda "con problemas"');

-- Oficio de riesgo: muestreo según el porcentaje (100 % y 0 % para la prueba).
select pg_temp.as_postgres();
update public.settings set value = '100' where key = 'supervision_sample_pct';
select pg_temp.open_job(:q, :gas, 6000) as job2 \gset
select pg_temp.open_job(:q, :skill, 6000) as job3 \gset
select pg_temp.as_user(:c);
select public.accept_offer((select id from public.offers where job_id = :'job2'));
select public.accept_offer((select id from public.offers where job_id = :'job3'));
select pg_temp.as_postgres();
select is((select reason from public.job_supervisions where job_id = :'job2'), 'risk_sample', 'en oficio de riesgo se muestrea');
select is((select count(*)::int from public.job_supervisions where job_id = :'job3'), 0, 'en oficio de habilidad no');
select pg_temp.as_user(:c);
select public.cancel_service(:'job2', 'Ya no lo necesito');
select pg_temp.as_postgres();
select is((select status from public.job_supervisions where job_id = :'job2'), 'cancelled', 'si se cancela, la supervisión se cierra');

select * from finish();
rollback;
