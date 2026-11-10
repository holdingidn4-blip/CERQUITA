-- Datos de prueba para `supabase db reset`. Solo local: no usar en producción.

insert into public.trades (slug, name) values
  ('gasfiteria', 'Gasfitería'),
  ('electricidad', 'Electricidad'),
  ('carpinteria', 'Carpintería'),
  ('pintura', 'Pintura'),
  ('hogar', 'Hogar');

-- Parámetros (regla 9). TODO(decidir): trabajos sin comisión de la promoción de lanzamiento.
insert into public.settings (key, scope, value) values
  ('commission_rate_bps', 'global', '1000'),
  ('debt_limit_cents', 'global', '3000'),
  ('grace_days', 'global', '3'),
  ('launch_promo_jobs', 'global', '0');

-- Usuarios de prueba (ingreso por SMS local: cualquier código con test_otp en config.toml).
insert into auth.users (instance_id, id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   '51900000001', now(), '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   '51900000002', now(), '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-9999-9999-999999999999', 'authenticated', 'authenticated',
   '51900000009', now(), '{"provider":"phone","providers":["phone"],"staff_role":"reviewer"}', '{}', now(), now());

-- GoTrue no acepta NULL en las columnas de tokens.
update auth.users set
  confirmation_token = '', recovery_token = '', email_change = '', email_change_token_new = '',
  email_change_token_current = '', phone_change = '', phone_change_token = '', reauthentication_token = ''
where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '99999999-9999-9999-9999-999999999999');

update public.profiles set full_name = 'Carla Cliente' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set full_name = 'Pedro Gasfitero', active_role = 'pro' where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set full_name = 'Rita Revisora' where id = '99999999-9999-9999-9999-999999999999';

insert into public.pro_trades (pro_id, trade_id, status, reviewed_by, reviewed_at)
select '22222222-2222-2222-2222-222222222222', id, 'approved_observation', '99999999-9999-9999-9999-999999999999', now()
from public.trades where slug = 'gasfiteria';

-- Miraflores, Lima.
insert into public.pro_presence (pro_id, online, radius_m, last_point)
values ('22222222-2222-2222-2222-222222222222', true, 5000, 'SRID=4326;POINT(-77.0300 -12.1200)');
