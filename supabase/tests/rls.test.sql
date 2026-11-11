-- Pruebas de RLS y reglas del servidor. Corre con: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(63);
-- Las semillas traen un tarifario de ejemplo; cada prueba define el suyo (se revierte al final).
delete from public.trade_rate_cards;

-- ───────── Ayudantes ─────────
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

-- ───────── Datos ─────────
-- a, b: clientes · p: pro cerca · q: pro lejos · r: pro de otro oficio · s: soporte
insert into auth.users (id, phone, aud, role) values
  ('a0000000-0000-0000-0000-000000000000', '51911111111', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000000', '51922222222', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-000000000000', '51933333333', 'authenticated', 'authenticated'),
  ('d0000000-0000-0000-0000-000000000000', '51944444444', 'authenticated', 'authenticated'),
  ('e0000000-0000-0000-0000-000000000000', '51955555555', 'authenticated', 'authenticated'),
  ('f0000000-0000-0000-0000-000000000000', '51966666666', 'authenticated', 'authenticated');
\set a '\'a0000000-0000-0000-0000-000000000000\'::uuid'
\set b '\'b0000000-0000-0000-0000-000000000000\'::uuid'
\set p '\'c0000000-0000-0000-0000-000000000000\'::uuid'
\set q '\'d0000000-0000-0000-0000-000000000000\'::uuid'
\set r '\'e0000000-0000-0000-0000-000000000000\'::uuid'
\set s '\'f0000000-0000-0000-0000-000000000000\'::uuid'

insert into public.trades (slug, name) values ('t-gas', 'Gas prueba'), ('t-luz', 'Luz prueba');
insert into public.pro_trades (pro_id, trade_id, status)
select :p, id, 'approved_observation'::public.pro_trade_status from public.trades where slug = 't-gas' union all
select :q, id, 'approved_full' from public.trades where slug = 't-gas' union all
select :r, id, 'approved_full' from public.trades where slug = 't-luz';
insert into public.pro_presence (pro_id, online, radius_m, last_point) values
  (:p, true, 5000, 'SRID=4326;POINT(-77.0300 -12.1200)'),
  (:q, true, 5000, 'SRID=4326;POINT(-77.2000 -12.3000)'),
  (:r, true, 5000, 'SRID=4326;POINT(-77.0300 -12.1200)');
insert into public.jobs (id, client_id, trade_id, description, offered_price_cents, approx_point, exact_address)
select '10000000-0000-0000-0000-00000000000a'::uuid, :a::uuid, id, 'Fuga en el lavadero', 8000,
       'SRID=4326;POINT(-77.03123 -12.12345)'::extensions.geography, 'Av. Larco 123, dpto 4'
from public.trades where slug = 't-gas' union all
select '10000000-0000-0000-0000-00000000000b'::uuid, :b::uuid, id, 'Caño roto', 5000,
       'SRID=4326;POINT(-77.0310 -12.1210)'::extensions.geography, 'Calle Secreta 9'
from public.trades where slug = 't-gas';
\set job_a '\'10000000-0000-0000-0000-00000000000a\'::uuid'
\set job_b '\'10000000-0000-0000-0000-00000000000b\'::uuid'

-- ───────── jobs: aislamiento entre clientes ─────────
select pg_temp.as_user(:a);
select is((select count(*)::int from public.jobs where id = :job_a), 1, 'cliente ve su pedido');
select is((select count(*)::int from public.jobs where id = :job_b), 0, 'cliente NO ve pedidos ajenos');
select throws_ok('select exact_address from public.jobs', '42501', null, 'exact_address no se puede leer por SELECT');
select is(public.job_exact_address(:job_a), 'Av. Larco 123, dpto 4', 'cliente ve su dirección exacta');
select is(public.job_exact_address(:job_b), null, 'cliente NO ve la dirección de otro');
select throws_ok(format('update public.jobs set status = %L where id = %L', 'accepted', :job_a),
  '42501', null, 'cliente no puede aceptar por su cuenta');
select is((select extensions.st_x(approx_point::extensions.geometry) from public.jobs where id = :job_a),
  -77.031::float8, 'el punto aproximado se redondea en el servidor');

-- ───────── jobs: regla 4 (oficio aprobado, en línea, radio) ─────────
select pg_temp.as_user(:p);
select is((select count(*)::int from public.jobs where id = :job_a), 1, 'pro elegible ve el pedido');
select is(public.job_exact_address(:job_a), null, 'pro no ve la dirección antes de aceptar');
select is(public.job_counterpart_phone(:job_a), null, 'pro no ve el teléfono antes de aceptar');
select pg_temp.as_user(:q);
select is((select count(*)::int from public.jobs where id = :job_a), 0, 'pro fuera del radio NO ve el pedido');
select pg_temp.as_user(:r);
select is((select count(*)::int from public.jobs where id = :job_a), 0, 'pro de otro oficio NO ve el pedido');
select pg_temp.as_postgres();
update public.pro_presence set online = false where pro_id = :p;
select pg_temp.as_user(:p);
select is((select count(*)::int from public.jobs where id = :job_a), 0, 'pro desconectado NO ve el pedido');
select pg_temp.as_postgres();
update public.pro_presence set online = true where pro_id = :p;
update public.pro_trades set status = 'suspended' where pro_id = :p;
select pg_temp.as_user(:p);
select is((select count(*)::int from public.jobs where id = :job_a), 0, 'pro con oficio suspendido NO ve el pedido');
select pg_temp.as_postgres();
update public.pro_trades set status = 'approved_observation' where pro_id = :p;

-- ───────── offers ─────────
select pg_temp.as_user(:p);
select lives_ok(format('insert into public.offers (job_id, price_cents) values (%L, 9000)', :job_a),
  'pro elegible envía oferta');
select pg_temp.as_user(:q);
select throws_ok(format('insert into public.offers (job_id, price_cents) values (%L, 7000)', :job_a),
  '42501', null, 'pro no elegible NO puede ofertar');
select pg_temp.as_user(:p);
select throws_ok(format('update public.offers set status = %L where job_id = %L', 'accepted', :job_a),
  '42501', null, 'pro no puede aceptar su propia oferta');
select pg_temp.as_user(:a);
select is((select status::text from public.jobs where id = :job_a), 'with_offers', 'el pedido pasa a Con ofertas');
select is((select count(*)::int from public.offers where job_id = :job_a), 1, 'cliente ve ofertas de su pedido');
select pg_temp.as_user(:b);
select is((select count(*)::int from public.offers where job_id = :job_a), 0, 'otro cliente NO ve esas ofertas');

-- ───────── Tras aceptar (lo hará una función en la fase 5) ─────────
select pg_temp.as_postgres();
update public.offers set status = 'accepted' where job_id = :job_a;
update public.jobs set status = 'accepted', accepted_offer_id = (select id from public.offers where job_id = :job_a),
  final_price_cents = 9000, commission_rate_bps = 1000 where id = :job_a;
select pg_temp.as_user(:p);
select is(public.job_exact_address(:job_a), 'Av. Larco 123, dpto 4', 'pro asignado ve la dirección');
select is(public.job_counterpart_phone(:job_a), null, 'chat 100 % interno: ni el pro asignado ve el teléfono del cliente');
select pg_temp.as_user(:a);
select is(public.job_counterpart_phone(:job_a), null, 'ni el cliente ve el teléfono del pro');

-- ───────── job_tracks: regla 5 ─────────
select pg_temp.as_user(:p);
select throws_ok(format('insert into public.job_tracks (job_id, point) values (%L, %L)', :job_a, 'SRID=4326;POINT(-77.03 -12.12)'),
  '42501', null, 'sin "Ir al domicilio" no se comparte ubicación');
select pg_temp.as_postgres();
update public.jobs set status = 'on_the_way' where id = :job_a;
select pg_temp.as_user(:p);
select lives_ok(format('insert into public.job_tracks (job_id, point) values (%L, %L)', :job_a, 'SRID=4326;POINT(-77.03 -12.12)'),
  'pro asignado en camino envía ubicación');
select pg_temp.as_user(:r);
select throws_ok(format('insert into public.job_tracks (job_id, point) values (%L, %L)', :job_a, 'SRID=4326;POINT(-77.03 -12.12)'),
  '42501', null, 'otro pro NO puede enviar ubicación');
select pg_temp.as_user(:a);
select is((select count(*)::int from public.job_tracks where job_id = :job_a), 1, 'cliente ve el rastro de su servicio');
select pg_temp.as_user(:b);
select is((select count(*)::int from public.job_tracks where job_id = :job_a), 0, 'otro cliente NO ve el rastro');

-- ───────── profiles: regla 7 ─────────
select pg_temp.as_user(:a);
select is((select count(*)::int from public.profiles where id = :b), 0, 'cliente NO lee perfiles ajenos');
select throws_ok('update public.profiles set phone = ''999'' where id = auth.uid()', '42501', null,
  'el teléfono no se edita desde la app');
select is((select count(*)::int from public.public_profiles(array[:p::uuid])), 1, 'datos públicos sin teléfono');

-- ───────── wallet_entries: regla 2 ─────────
select pg_temp.as_user(:p);
select throws_ok(format('insert into public.wallet_entries (professional_id, type, amount_cents, idempotency_key) values (%L, %L, -900, %L)', :p, 'commission_debit', 'x'),
  '42501', null, 'la app no escribe en el libro');
select throws_ok(format('select public.wallet_post_entry(%L, %L, -900, %L)', :p, 'commission_debit', 'x'),
  '42501', null, 'la app no puede llamar a wallet_post_entry');
select pg_temp.as_postgres();
set local role service_role;
select throws_ok(format('insert into public.wallet_entries (professional_id, type, amount_cents, idempotency_key) values (%L, %L, -900, %L)', :p, 'commission_debit', 'y'),
  '42501', null, 'ni el service role inserta directo');
select is((public.wallet_post_entry(:p, 'commission_debit', -900, 'job:a:commission', :job_a)).balance_after_cents, -900, 'asiento de comisión');
select is((public.wallet_post_entry(:p, 'commission_debit', -900, 'job:a:commission', :job_a)).balance_after_cents, -900, 'repetir no duplica (idempotente)');
select throws_ok(format('select public.wallet_post_entry(%L, %L, -500, %L)', :p, 'commission_debit', 'job:a:commission'),
  '23505', null, 'misma clave con otro monto se rechaza');
select is((public.wallet_post_entry(:p, 'payment_credit', 500, 'proof:1')).balance_after_cents, -400, 'saldo acumulado correcto');
select throws_ok(format('select public.wallet_post_entry(%L, %L, 900, %L)', :p, 'commission_debit', 'z'),
  '23514', null, 'una comisión no puede ser positiva');
select pg_temp.as_postgres();
select throws_ok('update public.wallet_entries set amount_cents = -1', '42501', null, 'el libro no se edita');
select throws_ok('delete from public.wallet_entries', '42501', null, 'el libro no se borra');
select pg_temp.as_user(:p);
select is((select count(*)::int from public.wallet_entries), 2, 'pro ve sus asientos');
select pg_temp.as_user(:q);
select is((select count(*)::int from public.wallet_entries), 0, 'otro pro NO ve asientos ajenos');

-- ───────── verification_documents: regla 6 ─────────
select pg_temp.as_user(:p);
select lives_ok(format('insert into public.verification_documents (pro_id, kind, storage_path) values (%L, %L, %L)', :p, 'dni_front', :p || '/dni.jpg'),
  'pro registra su documento');
select throws_ok(format('insert into public.verification_documents (pro_id, kind, storage_path) values (%L, %L, %L)', :p, 'selfie', :q || '/x.jpg'),
  '42501', null, 'no puede apuntar a la carpeta de otro');
select throws_ok(format('select public.log_document_access(id) from public.verification_documents limit 1'),
  '42501', null, 'el pro no puede abrir documentos por la vía de soporte');
select pg_temp.as_user(:a);
select is((select count(*)::int from public.verification_documents), 0, 'cliente NO ve documentos');
select pg_temp.as_user(:s, 'reviewer');
select is((select public.log_document_access(id) from public.verification_documents where pro_id = :p),
  :p || '/dni.jpg', 'soporte obtiene la ruta para firmar');
select is((select count(*)::int from public.document_access_log l join public.verification_documents d on d.id = l.document_id where d.pro_id = :p), 1, 'la vista queda registrada');

-- ───────── pro_trades ─────────
select pg_temp.as_user(:p);
select throws_ok(format('update public.pro_trades set status = %L where pro_id = %L', 'approved_full', :p),
  '42501', null, 'el pro no se aprueba solo');

-- ───────── trusted_contacts ─────────
select pg_temp.as_user(:a);
insert into public.trusted_contacts (name, phone) values ('Mamá', '51910000001'), ('Papá', '51910000002'), ('Hermana', '51910000003');
select throws_ok('insert into public.trusted_contacts (name, phone) values (''Tío'', ''51910000004'')',
  '23514', null, 'máximo 3 contactos');
select pg_temp.as_user(:b);
select is((select count(*)::int from public.trusted_contacts), 0, 'otro usuario NO ve tus contactos');

-- ───────── sos_alerts ─────────
select pg_temp.as_user(:a);
select public.sos_open(:job_a, -12.12, -77.03);
select throws_ok(format('select public.sos_close(%L, %L)', (select id from public.sos_alerts limit 1), 'listo'), '42501', null, 'el usuario no cierra la alerta');
select pg_temp.as_user(:b);
select is((select count(*)::int from public.sos_alerts), 0, 'otro usuario NO ve la alerta');

-- ───────── storage ─────────
select pg_temp.as_user(:a);
select lives_ok(format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, auth.uid()::text)', 'job-photos', :job_a || '/1.jpg'),
  'cliente sube foto a su pedido');
select throws_ok(format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, auth.uid()::text)', 'job-photos', :job_b || '/1.jpg'),
  '42501', null, 'cliente NO sube fotos a pedidos ajenos');
select pg_temp.as_user(:b);
select is((select count(*)::int from storage.objects where bucket_id = 'job-photos'), 0, 'otro cliente NO ve las fotos');
select pg_temp.as_user(:p);
select is((select count(*)::int from storage.objects where bucket_id = 'job-photos'), 1, 'pro asignado ve las fotos');
select lives_ok(format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, auth.uid()::text)', 'verification', :p || '/dni.jpg'),
  'pro sube DNI a su carpeta');
select is((select count(*)::int from storage.objects where bucket_id = 'verification'), 0, 'el DNI no se lee desde la app');
select throws_ok(format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, auth.uid()::text)', 'verification', :q || '/dni.jpg'),
  '42501', null, 'no sube a la carpeta de otro');
select pg_temp.as_user(:s, 'reviewer');
select is((select count(*)::int from storage.objects where bucket_id = 'verification'), 0, 'ni soporte lee directo: solo URL firmada');

-- ───────── anon ─────────
select pg_temp.as_postgres();
set local role anon;
select throws_ok('select id from public.jobs', '42501', null, 'anónimo no lee pedidos');

select * from finish();
rollback;
