-- ═══ Cerquita · datos iniciales de PRODUCCIÓN para el piloto Huancayo ═══
-- Idempotente (upsert): se puede volver a correr para actualizar montos.
-- Uso: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed_huancayo_production.sql
--
-- ⚠️ IMPORTANTE: los montos son ESTIMADOS DE REFERENCIA preparados para el arranque, NO precios
-- relevados en campo ni cotizaciones vigentes de las tiendas. Antes de publicar, valídalos con
-- profesionales de Huancayo y con los precios actuales de Promart, Sodimac y Maestro, y ajústalos
-- aquí o en el panel (Tarifario). Todos en céntimos de sol (regla 1).

begin;

-- ───────── Ciudad, moneda y parámetros del piloto ─────────
insert into public.settings (key, scope, value) values
  ('active_city', 'global', '"huancayo"'),
  ('currency_code', 'city:huancayo', '"PEN"'),
  ('diagnostic_visit_fee_cents', 'city:huancayo', '2000'),
  ('default_visit_fee_cents', 'city:huancayo', '3000')
on conflict (key, scope) do update set value = excluded.value;

-- Datos de pago de la empresa (pantalla 15): se cargan en el panel → Parámetros.
-- No se ponen aquí para no versionar datos financieros. Claves: yape_number, plin_number,
-- yape_qr_url, plin_qr_url, account_holder, bank_account.

-- ───────── Tarifario sugerido (estimado, validar) ─────────
insert into public.trade_rate_cards (trade_id, city_slug, unit, label, min_cents, suggested_cents, max_cents, visit_fee_cents)
select t.id, 'huancayo', v.unit::public.pricing_unit, v.label, v.min_c, v.sug_c, v.max_c, v.visit_c
from (values
  -- técnicos
  ('gasfiteria',   'job',  'Reparación de gasfitería (fugas, llaves, desatoros)', 3500, 8000, 25000, 3000),
  ('electricidad', 'job',  'Reparación eléctrica (tomas, llaves, luminarias)',   3500, 9000, 30000, 3000),
  ('hogar',        'job',  'Arreglos generales del hogar',                        3000, 7000, 20000, 2500),
  -- construcción
  ('albanileria',  'job',  'Trabajo de albañilería (por encargo)',                6000, 18000, 150000, 4000),
  ('carpinteria',  'job',  'Carpintería (reparación o instalación)',             4000, 12000, 80000, 3500),
  ('pintura',      'job',  'Pintura de ambientes (por encargo)',                  6000, 25000, 120000, 3500),
  -- servicio del hogar
  ('limpieza',     'hour', 'Hora de limpieza del hogar',                          1000, 1300, 2000, null),
  ('cuidado',      'day',  'Día de cuidado de personas',                          5000, 7000, 12000, null),
  -- choferes
  ('chofer',       'hour', 'Hora de chofer (con vehículo del cliente)',           1500, 2000, 3500, null)
) v(slug, unit, label, min_c, sug_c, max_c, visit_c)
join public.trades t on t.slug = v.slug
on conflict (trade_id, city_slug, unit) do update
  set label = excluded.label, min_cents = excluded.min_cents, suggested_cents = excluded.suggested_cents,
      max_cents = excluded.max_cents, visit_fee_cents = excluded.visit_fee_cents, updated_at = now();

-- ───────── Catálogo de materiales homologados (precios de referencia estimados, validar) ─────────
-- Se identifica por (tienda, marca, nombre); el reembolso real siempre es contra boleta.
create temporary table _catalog (store text, brand text, name text, unit text, category public.trade_category, price int) on commit drop;
insert into _catalog values
  ('promart',  'Vainsa',          'Llave de paso 1/2"',                      'unidad',  'technical',    2500),
  ('promart',  'Pavco',           'Tubo PVC agua 1/2" x 5 m',                'unidad',  'technical',    1500),
  ('promart',  'Genérico',        'Cinta teflón 3/4"',                        'rollo',   'technical',     350),
  ('sodimac',  'Trébol',          'Grifo para lavadero cromado',              'unidad',  'technical',    6990),
  ('sodimac',  'Indeco',          'Cable THW 14 AWG x 100 m',                 'rollo',   'technical',   19900),
  ('sodimac',  'Bticino',         'Tomacorriente doble con línea a tierra',   'unidad',  'technical',    1690),
  ('maestro',  'Schneider',       'Interruptor termomagnético 2x20 A',        'unidad',  'technical',    3990),
  ('maestro',  'Sol',             'Cemento Portland Tipo I 42.5 kg',          'bolsa',   'construction', 3300),
  ('maestro',  'Aceros Arequipa', 'Fierro corrugado 1/2" x 9 m',              'varilla', 'construction', 3600),
  ('maestro',  'Genérico',        'Arena gruesa',                             'saco',    'construction',  700),
  ('promart',  'Cpp',             'Pintura látex lavable 1 gl',               'galón',   'construction', 4900),
  ('sodimac',  'Vencedor',        'Pintura látex 4 gl',                       'balde',   'construction',15900)
;
insert into public.materials_catalog (store, brand, name, unit, category, reference_price_cents, city_slug)
select c.store, c.brand, c.name, c.unit, c.category, c.price, 'huancayo' from _catalog c
where not exists (
  select 1 from public.materials_catalog m where m.store = c.store and m.brand = c.brand and m.name = c.name and m.city_slug = 'huancayo'
);
update public.materials_catalog m set reference_price_cents = c.price, unit = c.unit, active = true, updated_at = now()
from _catalog c where m.store = c.store and m.brand = c.brand and m.name = c.name and m.city_slug = 'huancayo';

commit;
