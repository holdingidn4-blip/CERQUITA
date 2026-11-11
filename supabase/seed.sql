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
   '51900000009', now(), '{"provider":"phone","providers":["phone"],"staff_role":"reviewer"}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '88888888-8888-8888-8888-888888888888', 'authenticated', 'authenticated',
   '51900000008', now(), '{"provider":"phone","providers":["phone"],"staff_role":"admin"}', '{}', now(), now());

-- GoTrue no acepta NULL en las columnas de tokens.
update auth.users set
  confirmation_token = '', recovery_token = '', email_change = '', email_change_token_new = '',
  email_change_token_current = '', phone_change = '', phone_change_token = '', reauthentication_token = ''
where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '99999999-9999-9999-9999-999999999999', '88888888-8888-8888-8888-888888888888');

update public.profiles set full_name = 'Carla Cliente' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set full_name = 'Pedro Gasfitero', active_role = 'pro' where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set full_name = 'Rita Revisora' where id = '99999999-9999-9999-9999-999999999999';
update public.profiles set full_name = 'Andrés Admin' where id = '88888888-8888-8888-8888-888888888888';

insert into public.pro_trades (pro_id, trade_id, status, reviewed_by, reviewed_at)
select '22222222-2222-2222-2222-222222222222', id, 'approved_observation', '99999999-9999-9999-9999-999999999999', now()
from public.trades where slug = 'gasfiteria';

-- Huancayo (piloto), cerca de la Plaza Constitución.
insert into public.pro_presence (pro_id, online, radius_m, last_point)
values ('22222222-2222-2222-2222-222222222222', true, 5000, 'SRID=4326;POINT(-75.2040 -12.0660)');

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

-- Tarifario y catálogo de EJEMPLO para Huancayo (solo local).
-- TODO(decidir): montos reales del mercado de Huancayo y precios de referencia vigentes de cada tienda.
insert into public.trade_rate_cards (trade_id, unit, label, min_cents, suggested_cents, max_cents, visit_fee_cents)
select t.id, v.unit::public.pricing_unit, v.label, v.min_c, v.sug_c, v.max_c, v.visit_c
from (values
  ('gasfiteria', 'job', 'Reparación de gasfitería', 3000, 8000, 20000, 3000),
  ('electricidad', 'job', 'Reparación eléctrica', 3000, 9000, 25000, 3000),
  ('albanileria', 'job', 'Trabajo de albañilería', 5000, 15000, 80000, 4000),
  ('limpieza', 'hour', 'Hora de limpieza', 1000, 1200, 1800, null),
  ('cuidado', 'day', 'Día de cuidado', 6000, 8000, 12000, null),
  ('chofer', 'hour', 'Hora de chofer', 1500, 2000, 3000, null)
) v(slug, unit, label, min_c, sug_c, max_c, visit_c)
join public.trades t on t.slug = v.slug;

insert into public.materials_catalog (store, brand, name, unit, category, reference_price_cents) values
  ('promart', 'Vainsa', 'Llave de paso 1/2" (ejemplo)', 'unidad', 'technical', 1590),
  ('sodimac', 'Pavco', 'Tubo PVC 1/2" x 5 m (ejemplo)', 'unidad', 'technical', 1290),
  ('promart', 'Genérico', 'Cinta teflón 3/4" (ejemplo)', 'rollo', 'technical', 350),
  ('sodimac', 'Indeco', 'Cable THW 14 AWG x 100 m (ejemplo)', 'rollo', 'technical', 18900),
  ('ferreteria', 'Sol', 'Cemento Portland Tipo I 42.5 kg (ejemplo)', 'bolsa', 'construction', 3290),
  ('promart', 'Cpp', 'Pintura látex 1 gl (ejemplo)', 'galón', 'construction', 4590),
  ('maestro', 'Aceros Arequipa', 'Fierro corrugado 1/2" x 9 m (ejemplo)', 'varilla', 'construction', 3490),
  ('maestro', 'Trébol', 'Grifería para lavadero (ejemplo)', 'unidad', 'technical', 8990);
