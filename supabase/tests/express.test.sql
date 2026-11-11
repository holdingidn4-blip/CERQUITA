-- Pruebas del módulo final: filtro del chat, lista negra, video temporal, visita de diagnóstico,
-- Puntos Cerquita, ranking, reclamos y catálogo con Maestro.
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);
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

\set c '\'a8000000-0000-0000-0000-000000000000\'::uuid'
\set p '\'b8000000-0000-0000-0000-000000000000\'::uuid'
\set o '\'c8000000-0000-0000-0000-000000000000\'::uuid'
\set s '\'d8000000-0000-0000-0000-000000000000\'::uuid'
insert into auth.users (id, phone, aud, role) values
  (:c, '51922000001', 'authenticated', 'authenticated'),
  (:p, '51922000002', 'authenticated', 'authenticated'),
  (:o, '51922000003', 'authenticated', 'authenticated'),
  (:s, '51922000004', 'authenticated', 'authenticated');
update public.profiles set full_name = 'Ana Torres' where id = :p;
insert into public.pro_trades (pro_id, trade_id, status) select :p, id, 'approved_full' from public.trades where slug = 'gasfiteria';
insert into public.pro_presence (pro_id, online, radius_m, last_point) values (:p, true, 5000, 'SRID=4326;POINT(-75.2049 -12.0651)');

-- ───────── Filtro antifraude del chat (función pura) ─────────
select is(private.chat_violation('Mi número es 987 654 321'), 'phone', 'bloquea un celular con espacios');
select is(private.chat_violation('llama al 9-8-7-6-5-4-3-2-1'), 'phone', 'bloquea un celular con guiones');
select is(private.chat_violation('+51 (987) 654.321'), 'phone', 'bloquea un celular con código de país');
select is(private.chat_violation('escríbeme: rosa.v@gmail.com'), 'email', 'bloquea un correo');
select is(private.chat_violation('rosa arroba gmail punto com'), 'email', 'bloquea un correo escrito en palabras');
select is(private.chat_violation('Pásame tu WhatsApp'), 'keyword', 'bloquea WhatsApp');
select is(private.chat_violation('mándame al wsp'), 'keyword', 'bloquea “wsp”');
select is(private.chat_violation('Llámame al rato'), 'keyword', 'bloquea “Llámame al”');
select is(private.chat_violation('págame por fuera y te hago descuento'), 'keyword', 'bloquea pagos fuera de la app');
select is(private.chat_violation('Toca el timbre del 302, llego en 15 min'), null, 'deja pasar mensajes normales con números cortos');
select is(private.chat_violation('El repuesto cuesta S/ 120.50'), null, 'deja pasar precios');

-- ───────── Pedido con video y visita de diagnóstico ─────────
select pg_temp.as_user(:c);
select throws_ok(format('insert into public.jobs (trade_id, description, offered_price_cents, approx_point, exact_address, diagnostic_visit) values (%s, %L, 1000, %L, %L, true)',
  (select id from public.trades where slug = 'gasfiteria'), 'Diagnóstico', 'SRID=4326;POINT(-75.2049 -12.0651)', 'Jr. Ica 1'),
  'P0001', null, 'una visita de diagnóstico no baja de S/ 20');
insert into public.jobs (trade_id, description, offered_price_cents, approx_point, exact_address, diagnostic_visit)
select id, 'Ruido en la terma', 2000, 'SRID=4326;POINT(-75.2049 -12.0651)', 'Jr. Ica 100', true from public.trades where slug = 'gasfiteria';
select id as job from public.jobs where description = 'Ruido en la terma' \gset
select is(public.diagnostic_visit_fee(), 2000, 'la visita de diagnóstico cuesta S/ 20 (settings)');
select throws_ok(format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, auth.uid()::text)', 'temp_media', 'otro/v.mp4'),
  '42501', null, 'el video solo va en la carpeta de su pedido');
insert into storage.objects (bucket_id, name, owner_id) values ('temp_media', :'job' || '/video.mp4', auth.uid()::text);
select throws_ok(format('select public.attach_job_video(%L, %L, 30)', :'job', :'job' || '/video.mp4'), '22023', null,
  'un video de más de 15 s se rechaza');
select is((select video_seconds from public.attach_job_video(:'job', :'job' || '/video.mp4', 12)), 12::smallint, 'adjunta un video de 12 s');

-- ───────── Lista negra (aviso discreto solo a técnicos) ─────────
select pg_temp.as_user(:p);
select is((select caution from public.nearby_jobs() where id = :'job'), false, 'sin antecedentes no hay aviso');
select is((select count(*)::int from public.blacklisted_locations), 0, 'el técnico no ve la lista negra');
select pg_temp.as_user(:s, 'support');
select lives_ok('insert into public.blacklisted_locations (point, reason) values (''SRID=4326;POINT(-75.2050 -12.0652)'', ''Agresión a un técnico'')',
  'soporte registra una dirección con antecedentes');
select pg_temp.as_user(:p);
select is((select caution from public.nearby_jobs() where id = :'job'), true, 'el técnico ve el aviso en el pedido cercano');
select is(public.job_caution(:'job'), true, 'y con job_caution()');
select ok(not exists (
  select 1 from information_schema.routines r join information_schema.parameters x on x.specific_name = r.specific_name
  where r.routine_name = 'nearby_jobs' and x.parameter_name in ('reason', 'blacklist_reason')
), 'el técnico no recibe el motivo');
select pg_temp.as_user(:c);
select is(public.job_caution(:'job'), null, 'el cliente no recibe el aviso');

-- ───────── Video temporal para el técnico ─────────
select pg_temp.as_user(:p);
select is((select video_path from public.nearby_jobs() where id = :'job'), :'job' || '/video.mp4', 'el técnico ve el video del pedido');
select ok((select video_expires_at between now() + interval '47 hours' and now() + interval '49 hours' from public.nearby_jobs() where id = :'job'),
  'con su vencimiento a las 48 h');
select is((select count(*)::int from storage.objects where bucket_id = 'temp_media'), 1, 'y puede abrir el archivo');
select pg_temp.as_postgres();
update storage.objects set created_at = now() - interval '49 hours' where bucket_id = 'temp_media';
update public.jobs set video_uploaded_at = now() - interval '49 hours' where id = :'job';
select pg_temp.as_user(:p);
select is((select count(*)::int from storage.objects where bucket_id = 'temp_media'), 0, 'pasadas 48 h el video ya no se puede abrir');
select is((select video_path from public.nearby_jobs() where id = :'job'), null, 'ni aparece en la solicitud');
select pg_temp.as_postgres();
set local role service_role;
select ok(exists (select 1 from public.storage_orphans() where bucket_id = 'temp_media'), 'y la limpieza de Storage lo borra');

-- ───────── Chat interno + flags; visita de diagnóstico al cancelar ─────────
select pg_temp.as_user(:p);
insert into public.offers (job_id, price_cents) values (:'job', 2000);
select pg_temp.as_user(:c);
select public.accept_offer((select id from public.offers where job_id = :'job'));
select is((public.send_job_message(:'job', 'Mi número es 987654321') ->> 'blocked'), 'true', 'el chat bloquea el teléfono');
select is((select count(*)::int from public.job_messages where job_id = :'job'), 0, 'y no lo guarda');
select pg_temp.as_user(:s, 'support');
select is((select reason from public.chat_flags where job_id = :'job'), 'phone', 'soporte ve el intento bloqueado');
select pg_temp.as_user(:c);
select is((select count(*)::int from public.chat_flags), 0, 'el usuario no ve los registros de bloqueo');
select pg_temp.as_postgres();
update public.jobs set status = 'at_home' where id = :'job';
select pg_temp.as_user(:c);
select is((select visit_fee_cents from public.cancel_service(:'job', 'Ya no quiero')), 2000,
  'si cancela tras la visita de diagnóstico, debe S/ 20');

-- ───────── Puntos Cerquita y ranking ─────────
create function pg_temp.done_job(p_price int) returns uuid
language plpgsql as $$
declare v_job uuid; v_offer uuid;
begin
  insert into public.jobs (client_id, trade_id, description, offered_price_cents, approx_point, exact_address)
  select 'a8000000-0000-0000-0000-000000000000', id, 'Trabajo', p_price, 'SRID=4326;POINT(-75.2049 -12.0651)', 'Jr. Ica 2'
  from public.trades where slug = 'gasfiteria' returning id into v_job;
  insert into public.offers (job_id, pro_id, price_cents, status)
  values (v_job, 'b8000000-0000-0000-0000-000000000000', p_price, 'accepted') returning id into v_offer;
  update public.jobs set status = 'finished', accepted_offer_id = v_offer, final_price_cents = p_price, labor_cents = p_price,
    final_proposed_cents = p_price, commission_rate_bps = 1000 where id = v_job;
  return v_job;
end $$;
select pg_temp.as_postgres();
select pg_temp.done_job(20000) as j1 \gset
select pg_temp.as_user(:c);
select public.confirm_job(:'j1');
select is(public.my_points(), 200, 'gana 200 puntos por S/ 200 de mano de obra');
select public.confirm_job(:'j1');
select is(public.my_points(), 200, 'confirmar otra vez no duplica puntos');
select throws_ok('insert into public.points_entries (user_id, type, points, idempotency_key) values (auth.uid(), ''earn'', 9999, ''x'')',
  '42501', null, 'los puntos no se pueden crear desde la app (ni comprar)');
select pg_temp.as_postgres();
select pg_temp.done_job(10000) as j2 \gset
select pg_temp.as_user(:c);
select is((select points_discount_cents from public.apply_points(:'j2', 1000)), 1000,
  'aplica puntos con tope: máx. 20 % de S/ 100 = S/ 10 (200 pts × S/ 0.05)');
select public.confirm_job(:'j2');
select is(public.my_points(), 100, 'canjea 200 y gana 100 por el trabajo nuevo');
select pg_temp.as_postgres();
select is((select amount_cents from public.wallet_entries where idempotency_key = 'job:' || :'j2' || ':points-discount'), 1000,
  'Cerquita le abona al pro el descuento (el pro no pierde)');
select throws_ok('update public.points_entries set points = 1', '42501', null, 'el libro de puntos es inmutable');
select pg_temp.as_user(:p);
select ok((select rank_position >= 1 from public.pro_ranking() where is_me), 'el pro ve su posición en el ranking de Huancayo');
select is((select score from public.pro_ranking() where is_me), private.pro_score(:p), 'con puntaje por trabajos y calificación');
select ok((select bool_and(a.score >= b.score) from public.pro_ranking() a join public.pro_ranking() b on b.rank_position = a.rank_position + 1), 'ordenado de mayor a menor puntaje');

-- ───────── Reclamos con acceso auditado ─────────
select pg_temp.as_postgres();
insert into public.verification_documents (pro_id, kind, storage_path) values (:p, 'dni_front', :p || '/dni.jpg');
select pg_temp.as_user(:c);
select lives_ok(format('select public.file_claim(%L, %L)', :'j1', 'Se volvió a filtrar al día siguiente'), 'el cliente reclama un servicio de la app');
select pg_temp.as_user(:o);
select throws_ok(format('select public.file_claim(%L, %L)', :'j1', 'Reclamo ajeno de prueba'), '42501', null, 'nadie más puede reclamar ese servicio');
select pg_temp.as_user(:s, 'support');
select is((select jsonb_array_length(identity_docs) from public.claims_queue()), 1, 'soporte ve los documentos verificados del técnico para el reclamo');

select * from finish();
rollback;
