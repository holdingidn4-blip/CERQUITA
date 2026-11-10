-- Pruebas de la fase 3: perfil al registrarse, roles y soporte.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

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

\set u '\'a1000000-0000-0000-0000-000000000000\'::uuid'
\set v '\'b1000000-0000-0000-0000-000000000000\'::uuid'
insert into auth.users (id, phone, aud, role) values
  (:u, '51987000001', 'authenticated', 'authenticated'),
  (:v, '51987000002', 'authenticated', 'authenticated');

-- Perfil automático
select is((select phone from public.profiles where id = :u), '51987000001', 'el registro crea el perfil con el teléfono');
select is((select active_role::text from public.profiles where id = :u), 'client', 'el rol inicial es cliente');
update auth.users set phone = '51987000009' where id = :u;
select is((select phone from public.profiles where id = :u), '51987000009', 'el teléfono del perfil sigue al de la cuenta');

-- Cambio de modo Cliente / Profesional
select pg_temp.as_user(:u);
select lives_ok('update public.profiles set active_role = ''pro'' where id = auth.uid()', 'el usuario pasa a modo profesional');
select is((select active_role::text from public.my_account()), 'pro', 'my_account refleja el modo');
select is((select has_pro_trades from public.my_account()), false, 'sin oficios todavía');
select throws_ok('update public.profiles set active_role = ''admin'' where id = auth.uid()', '22P02', null,
  'no existe un modo admin en el perfil');
update public.profiles set active_role = 'client' where id = :v;
select pg_temp.as_postgres();
select is((select active_role::text from public.profiles where id = :v), 'client', 'no cambia el modo de otro usuario');

-- Soporte
select pg_temp.as_user(:u);
select is(public.is_staff(), false, 'un usuario normal no es soporte');
select is((select staff_role from public.my_account()), null, 'my_account sin rol de soporte');
select throws_ok(format('select public.set_staff_role(%L, %L)', :u, 'admin'), '42501', null,
  'un usuario no puede darse rol de soporte');
select throws_ok('update auth.users set raw_app_meta_data = ''{"staff_role":"admin"}''', '42501', null,
  'ni editando auth.users');
select pg_temp.as_postgres();
set local role service_role;
select lives_ok(format('select public.set_staff_role(%L, %L)', :u, 'reviewer'), 'el service role asigna soporte');
select throws_ok(format('select public.set_staff_role(%L, %L)', :u, 'root'), '22023', null, 'rol inválido');
select pg_temp.as_postgres();
select is((select raw_app_meta_data ->> 'staff_role' from auth.users where id = :u), 'reviewer', 'queda en app_metadata');
select pg_temp.as_user(:u, 'reviewer');
select is((select staff_role from public.my_account()), 'reviewer', 'con el token nuevo, my_account ve el rol');

select * from finish();
rollback;
