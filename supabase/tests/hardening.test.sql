-- F1 · Endurecimiento: permisos retirados, una política por acción y claves foráneas con índice.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);
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
-- Filas afectadas por un UPDATE con los permisos del rol actual
create function pg_temp.updated(p_sql text) returns int
language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;
create function pg_temp.as_postgres() returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

\set a '\'ac000000-0000-0000-0000-000000000001\'::uuid'
\set b '\'ac000000-0000-0000-0000-000000000002\'::uuid'
\set s '\'ac000000-0000-0000-0000-000000000009\'::uuid'
insert into auth.users (id, phone, aud, role) values
  (:a, '51972000001', 'authenticated', 'authenticated'),
  (:b, '51972000002', 'authenticated', 'authenticated'),
  (:s, '51972000009', 'authenticated', 'authenticated');

-- ───────── Estructura ─────────
select ok(not has_function_privilege('authenticated', 'public.job_counterpart_phone(uuid)', 'execute'),
  'la función del teléfono ya no se puede llamar');
select is((
  select count(*)::int from (
    select p.tablename, c.cmd, r.role
    from pg_policies p
    cross join lateral unnest(case when p.cmd = 'ALL' then array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] else array[p.cmd] end) as c (cmd)
    cross join lateral unnest(p.roles) as r (role)
    where p.schemaname = 'public' and p.permissive = 'PERMISSIVE' and r.role = 'authenticated'
    group by 1, 2, 3 having count(*) > 1
  ) dup), 0, 'ninguna tabla tiene dos políticas permisivas para la misma acción');
select is((
  select count(*)::int from pg_constraint c
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace
    and not exists (
      select 1 from pg_index i
      where i.indrelid = c.conrelid and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] = c.conkey
    )), 0, 'toda clave foránea tiene un índice');

-- ───────── Mismos permisos que antes ─────────
insert into public.materials_catalog (store, brand, name, unit, reference_price_cents, active)
values ('promart', 'Prueba', 'Material inactivo F1', 'unidad', 100, false);

select pg_temp.as_user(:a);
select is((select count(*)::int from public.materials_catalog where name = 'Material inactivo F1'), 0,
  'un cliente no ve materiales inactivos');
select throws_ok($$insert into public.trades (slug, name, category) values ('f1-test', 'Prueba', 'domestic')$$,
  '42501', null, 'un cliente no agrega oficios');
select is(pg_temp.updated($q$update public.settings set value = '999' where key = 'commission_rate_bps' and scope = 'global'$q$),
  0, 'un cliente no cambia parámetros');

select pg_temp.as_user(:s, 'reviewer');
select is((select count(*)::int from public.materials_catalog where name = 'Material inactivo F1'), 1,
  'soporte sí ve los inactivos');
select is(pg_temp.updated($q$update public.settings set value = '999' where key = 'commission_rate_bps' and scope = 'global'$q$),
  0, 'una revisora no cambia parámetros');
select is(pg_temp.updated($q$update public.trades set name = name where slug = 'gasfiteria'$q$),
  1, 'soporte edita oficios');

select pg_temp.as_user(:s, 'admin');
select is(pg_temp.updated($q$update public.settings set value = value where key = 'commission_rate_bps' and scope = 'global'$q$),
  1, 'el admin cambia parámetros');
select is(pg_temp.updated($q$update public.trade_rate_cards set min_cents = min_cents$q$) > 0,
  true, 'el admin cambia el tarifario');

-- SOS: la app no edita alertas directo (solo por las funciones SOS); soporte las cierra
select pg_temp.as_postgres();
insert into public.sos_alerts (user_id, status) values (:a, 'open');
select pg_temp.as_user(:a);
select throws_ok(format($q$update public.sos_alerts set status = 'cancelled' where user_id = %L$q$, :a),
  '42501', null, 'nadie edita una alerta sin pasar por las funciones SOS');
select pg_temp.as_user(:b);
select throws_ok(format($q$select public.sos_close((select id from public.sos_alerts where user_id = %L), 'x')$q$, :a),
  '42501', null, 'otro usuario no cierra la alerta ajena');
select pg_temp.as_user(:s, 'support');
select is((public.sos_close((select id from public.sos_alerts where user_id = :a), 'Atendida')).status::text,
  'closed', 'soporte la cierra');

select * from finish();
rollback;
