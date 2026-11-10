-- Pruebas de la fase 8: eliminar cuenta, archivos huérfanos y SOS.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

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

\set u '\'a6000000-0000-0000-0000-000000000000\'::uuid'
\set p '\'b6000000-0000-0000-0000-000000000000\'::uuid'
\set s '\'c6000000-0000-0000-0000-000000000000\'::uuid'
insert into auth.users (id, phone, aud, role) values
  (:u, '51944000001', 'authenticated', 'authenticated'),
  (:p, '51944000002', 'authenticated', 'authenticated'),
  (:s, '51944000003', 'authenticated', 'authenticated');
update public.profiles set full_name = 'Rosa Vargas' where id = :u;
insert into public.trusted_contacts (user_id, name, phone) values (:u, 'Mamá', '51910000001');
insert into public.verification_documents (pro_id, kind, storage_path) values (:u, 'dni_front', :u || '/dni.jpg');
insert into public.wallet_entries (professional_id, type, amount_cents, idempotency_key) values (:u, 'commission_debit', -500, 'priv:1');
insert into public.jobs (id, client_id, trade_id, description, offered_price_cents, approx_point, exact_address)
select '10000000-0000-0000-0000-0000000000f8', :u, id, 'Abierto', 5000, 'SRID=4326;POINT(-77.03 -12.12)', 'Jr. Secreto 1'
from public.trades where slug = 'gasfiteria';
insert into public.jobs (id, client_id, trade_id, description, offered_price_cents, approx_point, exact_address, status)
select '10000000-0000-0000-0000-0000000000f9', :u, id, 'En curso', 5000, 'SRID=4326;POINT(-77.03 -12.12)', 'Jr. Secreto 2', 'published'
from public.trades where slug = 'gasfiteria';
insert into public.offers (id, job_id, pro_id, price_cents, status)
values ('20000000-0000-0000-0000-0000000000f9', '10000000-0000-0000-0000-0000000000f9', :p, 5000, 'accepted');
update public.jobs set status = 'on_the_way', accepted_offer_id = '20000000-0000-0000-0000-0000000000f9'
where id = '10000000-0000-0000-0000-0000000000f9';

-- ───────── SOS ─────────
select pg_temp.as_user(:u);
select is((select status::text from public.sos_open('10000000-0000-0000-0000-0000000000f9', -12.12, -77.03)), 'open',
  'el cliente abre un SOS en su servicio');
\set alert '(select id from public.sos_alerts where user_id = ''a6000000-0000-0000-0000-000000000000'')'
select lives_ok(format('select public.sos_update_location(%L, -12.121, -77.031)', :alert), 'comparte su ubicación');
select pg_temp.as_user(:s);
select throws_ok(format('select public.sos_open(%L)', '10000000-0000-0000-0000-0000000000f9'::uuid), '42501', null,
  'un tercero no abre SOS sobre ese servicio');
select is((select count(*)::int from public.sos_alerts), 0, 'ni ve alertas ajenas');
select throws_ok(format('select public.sos_close(%L, %L)', (select id from public.sos_alerts limit 1), 'x'), '42501', null,
  'un usuario no cierra alertas');
select is((select count(*)::int from public.sos_open_alerts()), 0, 'ni ve la lista de soporte');
select pg_temp.as_user(:s, 'support');
select is((select count(*)::int from public.sos_open_alerts()), 1, 'soporte ve la alerta abierta');
select is((select user_name from public.sos_open_alerts()), 'Rosa Vargas', 'con quién la abrió');
select ok((select latitude is not null from public.sos_open_alerts()), 'y su última posición');
select throws_ok(format('select public.sos_close(%L, %L)', (select id from public.sos_open_alerts() limit 1), ' '), '22023', null,
  'cerrar exige nota');
select is((select status::text from public.sos_close((select id from public.sos_open_alerts() limit 1), 'Llamamos, todo bien')),
  'closed', 'soporte cierra con nota');
select pg_temp.as_user(:u);
select throws_ok(format('select public.sos_update_location(%L, -12.1, -77.0)', :alert), 'P0001', null,
  'cerrada, ya no comparte ubicación');

-- ───────── Eliminar cuenta ─────────
select pg_temp.as_user(:u);
select throws_like('select public.delete_my_account()', 'Tienes un servicio en curso%', 'con un servicio en curso no se elimina');
select pg_temp.as_postgres();
update public.jobs set status = 'cancelled' where id = '10000000-0000-0000-0000-0000000000f9';
select pg_temp.as_user(:u);
select lives_ok('select public.delete_my_account()', 'sin servicios activos, elimina su cuenta');
select pg_temp.as_postgres();
select ok((select deleted_at is not null and full_name is null and phone is null from public.profiles where id = :u),
  'el perfil queda anonimizado');
select is((select phone from auth.users where id = :u), null, 'la cuenta de acceso queda sin teléfono');
select ok((select banned_until > now() + interval '100 years' from auth.users where id = :u), 'y bloqueada');
select is((select count(*)::int from public.trusted_contacts where user_id = :u), 0, 'se borran sus contactos de confianza');
select is((select count(*)::int from public.verification_documents where pro_id = :u), 0, 'y sus documentos');
select is((select status::text from public.jobs where id = '10000000-0000-0000-0000-0000000000f8'), 'cancelled', 'sus pedidos abiertos se cancelan');
select is((select exact_address from public.jobs where id = '10000000-0000-0000-0000-0000000000f8'), 'Dirección eliminada', 'sin dirección');
select is((select count(*)::int from public.wallet_entries where professional_id = :u), 1, 'el libro de cuentas se conserva');

-- ───────── Archivos huérfanos ─────────
insert into storage.objects (bucket_id, name, created_at) values
  ('verification', :u || '/dni.jpg', now() - interval '2 days'),
  ('verification', :p || '/reciente.jpg', now());
select pg_temp.as_user(:p);
select throws_ok('select * from public.storage_orphans()', '42501', null, 'la app no lista archivos huérfanos');
select pg_temp.as_postgres();
set local role service_role;
select ok(exists (select 1 from public.storage_orphans() where name = 'a6000000-0000-0000-0000-000000000000/dni.jpg'),
  'el DNI de la cuenta eliminada queda marcado para borrar');
select ok(not exists (select 1 from public.storage_orphans() where name like 'b6000000%'), 'una subida reciente se respeta');

select * from finish();
rollback;
