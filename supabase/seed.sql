-- Datos de prueba para `supabase db reset`. Solo local: no usar en producción.

-- Oficios y parámetros vienen en las migraciones (existen también en producción).

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

-- Identidad y evidencia del profesional de prueba (archivos ficticios, solo metadatos).
insert into public.verification_documents (pro_id, pro_trade_id, kind, storage_path)
select '22222222-2222-2222-2222-222222222222', null, k::public.verification_document_kind,
       '22222222-2222-2222-2222-222222222222/seed-' || k || '.jpg'
from unnest(array['dni_front', 'dni_back', 'selfie', 'background']) k;

-- Electricidad enviado y esperando revisión, para ver la cola del panel.
with pt as (
  insert into public.pro_trades (pro_id, trade_id, status)
  select '22222222-2222-2222-2222-222222222222', id, 'submitted' from public.trades where slug = 'electricidad'
  returning id
)
insert into public.verification_documents (pro_id, pro_trade_id, kind, storage_path)
select '22222222-2222-2222-2222-222222222222', pt.id, 'work_photo', '22222222-2222-2222-2222-222222222222/seed-luz-' || n || '.jpg'
from pt, generate_series(1, 2) n;
