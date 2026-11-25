-- Sección 4 · Catálogo de trabajos: 8 a 12 por oficio, trabajos de riesgo aprobados uno por uno,
-- "Otro trabajo" pendiente de revisión y pedidos con trabajo elegido.
begin;
create extension if not exists pgtap with schema extensions;
select plan(48);
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

\set c '\'c4000000-0000-0000-0000-000000000001\'::uuid'
\set p '\'c4000000-0000-0000-0000-000000000002\'::uuid'
\set q '\'c4000000-0000-0000-0000-000000000003\'::uuid'
\set n '\'c4000000-0000-0000-0000-000000000004\'::uuid'
\set r '\'c4000000-0000-0000-0000-000000000008\'::uuid'
\set s '\'c4000000-0000-0000-0000-000000000009\'::uuid'
insert into auth.users (id, phone, aud, role) values
  (:c, '51973000001', 'authenticated', 'authenticated'),
  (:p, '51973000002', 'authenticated', 'authenticated'),
  (:q, '51973000003', 'authenticated', 'authenticated'),
  (:n, '51973000004', 'authenticated', 'authenticated'),
  (:r, '51973000008', 'authenticated', 'authenticated'),
  (:s, '51973000009', 'authenticated', 'authenticated');
\set gas '(select id from public.trades where slug = ''gasfiteria'')'
\set luz '(select id from public.trades where slug = ''electricidad'')'
\set sp_gas '(select id from public.trade_specialties where slug = ''gas'' and trade_id = (select id from public.trades where slug = ''gasfiteria''))'
\set sp_fugas '(select id from public.trade_specialties where slug = ''fugas-agua'')'
\set sp_desatoro '(select id from public.trade_specialties where slug = ''desatoro'')'
\set sp_tableros '(select id from public.trade_specialties where slug = ''tableros'')'

-- ───────── Catálogo ─────────
select is((select count(*) from public.trades t where t.active and (
    select count(*) from public.trade_specialties ts where ts.trade_id = t.id and ts.active) not between 8 and 12),
  0::bigint, 'cada oficio activo tiene de 8 a 12 trabajos');
select is((select count(*) from public.trade_specialties where trade_id = :gas and active), 11::bigint,
  'gasfitería tiene 11 trabajos (incluye los de la lista del dueño)');
select ok((select requires_review from public.trade_specialties where id = :sp_gas), 'instalación de gas es de riesgo');
select ok(not (select requires_review from public.trade_specialties where id = :sp_fugas), 'fugas de agua no es de riesgo');
select ok((select search_terms like '%caño%' from public.trade_specialties where id = :sp_fugas),
  'cada trabajo tiene palabras de búsqueda');
set local role anon;
select ok((select count(*) > 80 from public.trade_specialties), 'el catálogo se lee sin cuenta');
reset role;
select ok(not has_function_privilege('anon', 'public.save_trade_specialty(smallint, smallint, text, text, boolean, boolean, smallint)', 'execute'),
  'anon no edita el catálogo');

-- ───────── El pro elige trabajos: los de riesgo quedan pendientes ─────────
insert into public.pro_trades (pro_id, trade_id, status) values (:p, :gas, 'draft'), (:q, :gas, 'approved_full'), (:n, :luz, 'draft');
select id as pt_p from public.pro_trades where pro_id = :p \gset
select id as pt_q from public.pro_trades where pro_id = :q \gset
select id as pt_n from public.pro_trades where pro_id = :n \gset
select pg_temp.as_user(:p);
select lives_ok(format('select public.set_pro_trade_specialties(%L, array[%s, %s]::smallint[])', :'pt_p', :sp_gas, :sp_fugas),
  'el pro elige fugas de agua e instalación de gas');
select is((select status from public.pro_trade_specialties where pro_trade_id = :'pt_p' and specialty_id = :sp_gas), 'pending',
  'el trabajo de riesgo queda pendiente de revisión');
select is((select status from public.pro_trade_specialties where pro_trade_id = :'pt_p' and specialty_id = :sp_fugas), 'included',
  'el trabajo común sigue la aprobación del oficio');
select throws_ok(format('select public.set_pro_trade_specialties(%L, array[%s]::smallint[])', :'pt_p', :sp_tableros),
  '22023', 'Esa especialidad no es de este oficio', 'no se mezcla un trabajo de otro oficio');
select throws_ok(format('update public.pro_trade_specialties set status = ''approved'' where pro_trade_id = %L', :'pt_p'),
  '42501', null, 'el pro no se aprueba solo un trabajo');
select throws_ok(format('select public.review_pro_specialty(%L, %s::smallint, ''approve'')', :'pt_p', :sp_gas),
  '42501', 'Solo soporte puede revisar trabajos', 'el pro no usa la revisión');

-- ───────── Soporte decide cada trabajo de riesgo ─────────
select pg_temp.as_user(:r, 'reviewer');
select throws_ok(format('select public.review_pro_specialty(%L, %s::smallint, ''reject'', '' '')', :'pt_p', :sp_gas),
  '22023', 'El motivo es obligatorio para rechazar', 'rechazar pide motivo');
select throws_ok(format('select public.review_pro_specialty(%L, %s::smallint, ''approve'')', :'pt_p', :sp_fugas),
  'P0001', 'Este trabajo no necesita aprobación aparte', 'un trabajo común no se revisa aparte');
select is((public.review_pro_specialty(:'pt_p', :sp_gas::smallint, 'approve')).status, 'approved',
  'la revisora aprueba la instalación de gas');
select pg_temp.as_postgres();
select is((select title from public.notification_outbox where user_id = :p and kind = 'specialty_review'),
  'Trabajo aprobado: Instalación de gas', 'el pro recibe el aviso de su trabajo aprobado');
select pg_temp.as_user(:p);
select lives_ok(format('select public.set_pro_trade_specialties(%L, array[%s, %s, %s]::smallint[])', :'pt_p', :sp_gas, :sp_fugas, :sp_desatoro),
  'agregar otro trabajo no borra lo ya revisado');
select is((select status from public.pro_trade_specialties where pro_trade_id = :'pt_p' and specialty_id = :sp_gas), 'approved',
  'la aprobación del trabajo de riesgo se conserva');

-- ───────── Pedidos de un trabajo de riesgo ─────────
select pg_temp.as_postgres();
update public.pro_trades set status = 'approved_full' where id = :'pt_p';
insert into public.pro_trade_specialties (pro_trade_id, specialty_id, status) values (:'pt_q', :sp_gas, 'pending');
insert into public.pro_presence (pro_id, online, radius_m, last_point) values
  (:p, true, 3000, 'SRID=4326;POINT(-75.2100 -12.0650)'),
  (:q, true, 3000, 'SRID=4326;POINT(-75.2105 -12.0650)');
select pg_temp.as_user(:c);
select throws_ok(format($$insert into public.jobs (trade_id, specialty_id, description, offered_price_cents, approx_point, exact_address)
  values (%s, %s, 'Revisar el tablero que salta', 9000, 'SRID=4326;POINT(-75.2100 -12.0660)', 'Jr. Puno 245')$$, :gas, :sp_tableros),
  '22023', 'Ese trabajo no es de este oficio', 'el trabajo elegido tiene que ser del oficio');
insert into public.jobs (trade_id, specialty_id, description, offered_price_cents, approx_point, exact_address)
values (:gas, :sp_gas, 'Instalar la cocina a gas natural', 12000, 'SRID=4326;POINT(-75.2100 -12.0660)', 'Jr. Puno 245');
select id as job_gas from public.jobs where client_id = :c and specialty_id = :sp_gas \gset
insert into public.jobs (trade_id, specialty_id, description, offered_price_cents, approx_point, exact_address)
values (:gas, :sp_desatoro, 'Desatorar el lavadero de la cocina', 8000, 'SRID=4326;POINT(-75.2100 -12.0660)', 'Jr. Puno 245');
select id as job_desatoro from public.jobs where client_id = :c and specialty_id = :sp_desatoro \gset
select is((select specialty_id from public.jobs where id = :'job_gas'), :sp_gas::smallint, 'el pedido guarda el trabajo elegido');

select pg_temp.as_user(:p);
select is((select specialty_name from public.nearby_jobs() where id = :'job_gas'), 'Instalación de gas',
  'con el trabajo aprobado, el pro ve el pedido con su nombre');
select lives_ok(format('insert into public.offers (job_id, price_cents) values (%L, 11000)', :'job_gas'),
  'y puede cotizarlo');
select pg_temp.as_user(:q);
select is((select count(*) from public.nearby_jobs() where id = :'job_gas'), 0::bigint,
  'sin el trabajo de riesgo aprobado, no aparece en sus solicitudes');
select is((select count(*) from public.jobs where id = :'job_gas'), 0::bigint, 'ni puede leer el pedido');
select throws_ok(format('insert into public.offers (job_id, price_cents) values (%L, 11000)', :'job_gas'),
  '42501', null, 'ni cotizarlo');
select is((select count(*) from public.nearby_jobs() where id = :'job_desatoro'), 1::bigint,
  'un trabajo común le llega a todo el oficio aprobado (aunque no lo haya marcado)');
select pg_temp.as_postgres();
select is((select count(*) from public.notification_outbox where kind = 'job_nearby' and (data ->> 'job_id')::uuid = :'job_gas' and user_id = :q),
  0::bigint, 'el aviso de pedido de riesgo no le llega a quien no lo tiene aprobado');
select is((select title from public.notification_outbox where kind = 'job_nearby' and (data ->> 'job_id')::uuid = :'job_gas' and user_id = :p),
  'Nuevo pedido cerca: Instalación de gas', 'el aviso dice el trabajo');
insert into public.pro_trade_specialties (pro_trade_id, specialty_id, status) values (:'pt_q', :sp_desatoro, 'rejected');
select pg_temp.as_user(:q);
select is((select count(*) from public.nearby_jobs() where id = :'job_desatoro'), 0::bigint,
  'un trabajo que soporte le rechazó deja de llegarle');

-- ───────── "Otro trabajo" ─────────
select pg_temp.as_user(:n);
select throws_ok(format('select public.request_specialty(%L, ''Llámame al 964 123 456'')', :'pt_n'),
  '22023', 'Escribe solo el nombre del trabajo, sin teléfonos, correos ni redes', 'sin teléfonos en el texto');
select throws_ok(format('select public.request_specialty(%L, ''pozo a tierra'')', :'pt_n'),
  '23505', 'Ese trabajo ya está en la lista: búscalo y márcalo', 'si ya existe, lo manda a buscarlo');
select is((public.request_specialty(:'pt_n', '  Paneles   solares ')).status, 'pending', 'otro trabajo queda pendiente de revisión');
select is((select name from public.specialty_requests where pro_id = :n), 'Paneles solares', 'el texto se limpia');
select throws_ok(format('select public.request_specialty(%L, ''paneles solares'')', :'pt_n'),
  '23505', 'Ya enviaste ese trabajo: está pendiente de revisión', 'no se repite');
select lives_ok(format('select public.request_specialty(%L, ''Cercos eléctricos''), public.request_specialty(%L, ''Grupos electrógenos'')', :'pt_n', :'pt_n'),
  'puede enviar hasta 3');
select throws_ok(format('select public.request_specialty(%L, ''Alarmas'')', :'pt_n'),
  'P0001', 'Ya tienes 3 trabajos esperando revisión. Espera la respuesta de soporte.', 'máximo 3 pendientes');
select is((select count(*) from public.trade_specialties where name = 'Paneles solares'), 0::bigint,
  'mientras tanto no entra al catálogo (no recibe pedidos)');
select pg_temp.as_user(:p);
select is((select count(*) from public.specialty_requests), 0::bigint, 'otro pro no ve esos pedidos');

select pg_temp.as_user(:r, 'reviewer');
select id as req from public.specialty_requests where name = 'Paneles solares' \gset
select id as req2 from public.specialty_requests where name = 'Grupos electrógenos' \gset
select throws_ok(format('select public.review_specialty_request(%L, ''reject'')', :'req2'),
  '22023', 'El motivo es obligatorio para rechazar', 'rechazar un trabajo nuevo pide motivo');
select is((public.review_specialty_request(:'req', 'approve', 'Paneles solares', true)).status, 'approved',
  'soporte lo aprueba como trabajo de riesgo');
select is((select requires_review from public.trade_specialties where trade_id = :luz and name = 'Paneles solares'), true,
  'y queda en el catálogo del oficio');
select is((select pts.status from public.pro_trade_specialties pts join public.trade_specialties ts on ts.id = pts.specialty_id
  where pts.pro_trade_id = :'pt_n' and ts.name = 'Paneles solares'), 'approved', 'y en la lista del pro, ya aprobado');
select throws_ok(format('select public.review_specialty_request(%L, ''approve'')', :'req'),
  'P0001', 'Este pedido ya fue revisado', 'no se revisa dos veces');

-- ───────── Edición del catálogo ─────────
select throws_ok(format('select public.save_trade_specialty(null, %s::smallint, ''Medidores inteligentes'')', :luz),
  '42501', 'Solo soporte o administración edita el catálogo', 'la revisora no edita el catálogo');
select pg_temp.as_user(:s, 'support');
select is((public.save_trade_specialty(null, :luz::smallint, 'Medidores inteligentes', 'medidor wifi')).slug, 'medidores-inteligentes',
  'soporte agrega un trabajo');
select lives_ok(format('select public.save_trade_specialty(%s::smallint, null, ''Fugas de agua'', ''caño gotea'', true)', :sp_fugas),
  'soporte marca un trabajo como de riesgo');
select is((select status from public.pro_trade_specialties where pro_trade_id = :'pt_p' and specialty_id = :sp_fugas), 'pending',
  'quien ya lo tenía pasa a revisión de ese trabajo');

select * from finish();
rollback;
