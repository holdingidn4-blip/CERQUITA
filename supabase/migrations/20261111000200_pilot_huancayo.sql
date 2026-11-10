-- Piloto Huancayo: ciudad y moneda, 4 categorías, requisitos por categoría, tarifario, catálogo de
-- materiales, comisión solo sobre mano de obra, reevaluación en sitio, tarifa de visita y antifraude GPS.
--
-- Nombres: “orders” de la especificación = public.jobs; “commission_ledger” = public.wallet_entries.

-- ═════════════════════════ 1. Ciudad, moneda y parámetros por ciudad ═════════════════════════
insert into public.settings (key, scope, value) values
  ('active_city', 'global', '"huancayo"'),
  ('currency_code', 'global', '"PEN"'),
  ('currency_code', 'city:huancayo', '"PEN"'),
  -- TODO(decidir): tarifa base de visita/diagnóstico por defecto (si el oficio no tiene tarifario).
  ('default_visit_fee_cents', 'city:huancayo', '3000'),
  ('bypass_radius_m', 'global', '150'),
  ('bypass_minutes', 'global', '15'),
  ('bypass_max_per_week', 'global', '2'),
  ('domestic_min_references', 'global', '2')
on conflict (key, scope) do nothing;

create function private.active_city() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select value #>> '{}' from public.settings where key = 'active_city' and scope = 'global'), 'huancayo')
$$;

-- Todos los parámetros se leen primero en la ciudad activa y luego en global (regla 9).
create or replace function private.setting_int(p_key text, p_default int) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select (value #>> '{}')::int from public.settings where key = p_key and scope = 'city:' || private.active_city()),
    (select (value #>> '{}')::int from public.settings where key = p_key and scope = 'global'),
    p_default)
$$;

create function private.setting_text(p_key text, p_default text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select value #>> '{}' from public.settings where key = p_key and scope = 'city:' || private.active_city()),
    (select value #>> '{}' from public.settings where key = p_key and scope = 'global'),
    p_default)
$$;

alter table public.profiles add column city_slug text not null default 'huancayo' check (city_slug ~ '^[a-z0-9-]+$');

-- ═════════════════════════ 2. Categorías de oficio ═════════════════════════
alter table public.trades
  add column category public.trade_category not null default 'technical',
  add column pricing_unit public.pricing_unit not null default 'job';

update public.trades set category = 'construction' where slug in ('carpinteria', 'pintura');
insert into public.trades (slug, name, pro_name, category, pricing_unit) values
  ('albanileria', 'Albañilería', 'Albañil', 'construction', 'job'),
  ('limpieza', 'Limpieza del hogar', 'Limpieza', 'domestic', 'hour'),
  ('cuidado', 'Cuidado de personas', 'Cuidador', 'domestic', 'day'),
  ('chofer', 'Chofer', 'Chofer', 'driver', 'hour')
on conflict (slug) do nothing;

-- ═════════════════════════ 3. Requisitos por categoría ═════════════════════════
-- Identidad (DNI, selfie, antecedentes) siempre; además, por categoría del oficio:
--   technical / construction: N evidencias del oficio (fotos, certificado, referencias, prueba)
--   driver: licencia de conducir + récord MTC/SAT
--   domestic: antecedentes policiales + penales + N referencias
create function private.trade_requirements(p_trade smallint)
returns table (requirement text, min_count int)
language sql stable security definer set search_path = '' as $$
  select r.requirement, r.min_count from public.trades t
  cross join lateral (
    select * from (values
      ('evidence', private.setting_int('min_trade_evidence', 2), array['technical', 'construction']),
      ('driver_license', 1, array['driver']),
      ('driver_record', 1, array['driver']),
      ('police_record', 1, array['domestic']),
      ('criminal_record', 1, array['domestic']),
      ('reference', private.setting_int('domestic_min_references', 2), array['domestic'])
    ) v(requirement, min_count, categories)
    where t.category::text = any (v.categories)
  ) r
  where t.id = p_trade
$$;

create function public.trade_requirements(p_trade smallint)
returns table (requirement text, min_count int)
language sql stable security definer set search_path = '' as $$
  select * from private.trade_requirements(p_trade) where (select auth.uid()) is not null
$$;
grant execute on function public.trade_requirements(smallint) to authenticated;

create or replace function private.pro_trade_missing(p_pro_trade uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  with pt as (select id, pro_id, trade_id from public.pro_trades where id = p_pro_trade),
  identity_missing as (
    select k::text as item from unnest(array['dni_front', 'dni_back', 'selfie', 'background']::public.verification_document_kind[]) k, pt
    where not exists (
      select 1 from public.verification_documents d where d.pro_id = pt.pro_id and d.kind = k and d.pro_trade_id is null
    )
  ),
  trade_missing as (
    select r.requirement as item, row_number() over () as ord
    from pt cross join lateral private.trade_requirements(pt.trade_id) r
    where (
      select count(*) from public.verification_documents d
      where d.pro_trade_id = pt.id and (
        (r.requirement = 'evidence' and d.kind in ('work_photo', 'certificate', 'reference', 'quiz'))
        or d.kind::text = r.requirement
      )
    ) < r.min_count
  )
  select coalesce((select array_agg(item order by item) from identity_missing), '{}')
      || coalesce((select array_agg(item order by ord) from trade_missing), '{}')
$$;

-- ═════════════════════════ 4. Tarifario y catálogo de materiales ═════════════════════════
create table public.trade_rate_cards (
  id bigint generated always as identity primary key,
  trade_id smallint not null references public.trades (id) on delete cascade,
  city_slug text not null default 'huancayo',
  unit public.pricing_unit not null,
  label text not null check (char_length(label) <= 120),
  min_cents int not null check (min_cents > 0),
  suggested_cents int not null,
  max_cents int not null,
  visit_fee_cents int check (visit_fee_cents >= 0),
  currency_code char(3) not null default 'PEN',
  updated_at timestamptz not null default now(),
  unique (trade_id, city_slug, unit),
  check (min_cents <= suggested_cents and suggested_cents <= max_cents)
);

create table public.materials_catalog (
  id uuid primary key default gen_random_uuid(),
  city_slug text not null default 'huancayo',
  store text not null check (store in ('promart', 'sodimac', 'ferreteria', 'otro')),
  brand text not null check (char_length(brand) <= 80),
  name text not null check (char_length(name) <= 160),
  unit text not null check (char_length(unit) <= 30),
  category public.trade_category,
  sku text,
  reference_price_cents int not null check (reference_price_cents > 0),
  currency_code char(3) not null default 'PEN',
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
create index on public.materials_catalog (city_slug, active);

alter table public.trade_rate_cards enable row level security;
alter table public.materials_catalog enable row level security;
grant select, insert, update, delete on public.trade_rate_cards, public.materials_catalog to authenticated;
create policy "rate cards: lectura" on public.trade_rate_cards for select to authenticated using (true);
create policy "rate cards: admin edita" on public.trade_rate_cards for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "catálogo: lectura de activos" on public.materials_catalog for select to authenticated
  using (active or public.is_staff());
create policy "catálogo: admin edita" on public.materials_catalog for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create trigger set_updated_at before update on public.trade_rate_cards for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.materials_catalog for each row execute function private.set_updated_at();

create function private.rate_card(p_trade smallint, p_unit public.pricing_unit) returns public.trade_rate_cards
language sql stable security definer set search_path = '' as $$
  select * from public.trade_rate_cards where trade_id = p_trade and unit = p_unit and city_slug = private.active_city()
$$;

create function private.visit_fee_cents(p_trade smallint) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select max(visit_fee_cents) from public.trade_rate_cards where trade_id = p_trade and city_slug = private.active_city()),
    private.setting_int('default_visit_fee_cents', 3000))
$$;

create function public.visit_fee_for_trade(p_trade smallint) returns int
language sql stable security definer set search_path = '' as $$
  select private.visit_fee_cents(p_trade) where (select auth.uid()) is not null
$$;
grant execute on function public.visit_fee_for_trade(smallint) to authenticated;

-- ═════════════════════════ 5. Pedido: unidad, desglose y reevaluación ═════════════════════════
alter table public.jobs
  add column city_slug text not null default 'huancayo',
  add column currency_code char(3) not null default 'PEN',
  add column pricing_unit public.pricing_unit not null default 'job',
  add column units smallint not null default 1 check (units between 1 and 31),
  add column labor_cents int check (labor_cents > 0),
  add column materials_cents int not null default 0 check (materials_cents >= 0),
  add column materials_provided_by public.materials_provider not null default 'client',
  add column materials_items jsonb not null default '[]',
  add column materials_receipt_path text,
  add column total_cents int generated always as (coalesce(labor_cents, 0) + materials_cents) stored,
  add column reeval_labor_cents int check (reeval_labor_cents > 0),
  add column reeval_materials_cents int check (reeval_materials_cents >= 0),
  add column reeval_materials_by public.materials_provider,
  add column reeval_items jsonb,
  add column reeval_receipt_path text,
  add column reeval_proposed_at timestamptz,
  add column reeval_answered_at timestamptz,
  add column visit_fee_cents int check (visit_fee_cents >= 0),
  add column cancelled_at timestamptz,
  add constraint jobs_materials_by_client check (materials_provided_by = 'pro' or materials_cents = 0);

grant select (
  city_slug, currency_code, pricing_unit, units, labor_cents, materials_cents, materials_provided_by, materials_items,
  materials_receipt_path, total_cents, reeval_labor_cents, reeval_materials_cents, reeval_materials_by, reeval_items,
  reeval_receipt_path, reeval_proposed_at, reeval_answered_at, visit_fee_cents, cancelled_at
) on public.jobs to authenticated;
grant insert (units) on public.jobs to authenticated;

-- Al publicar: ciudad y moneda del piloto, unidad del oficio y precio mínimo del tarifario (sin regateo a la baja).
create function private.prepare_job() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_unit public.pricing_unit;
  v_card public.trade_rate_cards;
begin
  select pricing_unit into v_unit from public.trades where id = new.trade_id;
  new.pricing_unit := coalesce(v_unit, 'job');
  if new.pricing_unit = 'job' then
    new.units := 1;
  end if;
  new.city_slug := private.active_city();
  new.currency_code := private.setting_text('currency_code', 'PEN');
  v_card := private.rate_card(new.trade_id, new.pricing_unit);
  if v_card.id is not null and new.offered_price_cents < v_card.min_cents * new.units then
    raise exception 'El precio mínimo sugerido es % céntimos por %', v_card.min_cents, new.pricing_unit using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger prepare_job before insert on public.jobs for each row execute function private.prepare_job();

-- Las ofertas deben caer dentro del tarifario (mínimo y máximo × unidades) cuando existe.
create function private.check_offer_rate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.jobs;
  v_card public.trade_rate_cards;
begin
  select * into v_job from public.jobs where id = new.job_id;
  v_card := private.rate_card(v_job.trade_id, v_job.pricing_unit);
  if v_card.id is not null and (new.price_cents < v_card.min_cents * v_job.units or new.price_cents > v_card.max_cents * v_job.units) then
    raise exception 'La oferta debe estar entre % y % céntimos (tarifario)', v_card.min_cents * v_job.units, v_card.max_cents * v_job.units
      using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger check_offer_rate before insert or update of price_cents on public.offers
  for each row execute function private.check_offer_rate();

-- Aceptar: la oferta es mano de obra; materiales en 0 hasta una reevaluación.
create or replace function public.accept_offer(p_offer uuid) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare
  v_offer public.offers;
  v_job public.jobs;
begin
  select * into v_offer from public.offers where id = p_offer;
  if not found then
    raise exception 'Oferta no encontrada' using errcode = 'P0002';
  end if;
  select * into v_job from public.jobs where id = v_offer.job_id for update;
  if v_job.client_id <> (select auth.uid()) then
    raise exception 'Solo quien hizo el pedido puede aceptar ofertas' using errcode = '42501';
  end if;
  if v_job.status not in ('published', 'with_offers') then
    raise exception 'Este pedido ya no recibe ofertas' using errcode = 'P0001';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'Esta oferta ya no está disponible' using errcode = 'P0001';
  end if;
  update public.offers set status = 'accepted' where id = p_offer;
  update public.offers set status = 'rejected' where job_id = v_job.id and id <> p_offer and status = 'pending';
  update public.jobs
  set status = 'accepted', accepted_offer_id = p_offer, final_price_cents = v_offer.price_cents,
      labor_cents = v_offer.price_cents, materials_cents = 0, materials_provided_by = 'client',
      commission_rate_bps = private.setting_int('commission_rate_bps', 1000)
  where id = v_job.id
  returning * into v_job;
  return v_job;
end $$;

-- ───────── Estados “activos” del servicio (price_renegotiated = sigue en el domicilio) ─────────
create function private.is_active_service(p_status public.job_status) returns boolean
language sql immutable set search_path = '' as $$
  select p_status in ('accepted', 'on_the_way', 'at_home', 'price_renegotiated', 'finished')
$$;
create function private.is_tracking_status(p_status public.job_status) returns boolean
language sql immutable set search_path = '' as $$
  select p_status in ('on_the_way', 'at_home', 'price_renegotiated')
$$;
grant execute on function private.is_active_service(public.job_status), private.is_tracking_status(public.job_status) to authenticated;

drop policy "tracks: solo el pro asignado en camino o en el domicilio" on public.job_tracks;
create policy "tracks: solo el pro asignado en camino o en el domicilio" on public.job_tracks for insert to authenticated
  with check (
    private.job_assigned_pro_id(job_id) = (select auth.uid()) and private.is_tracking_status(private.job_status(job_id))
  );
drop policy "chat: escribir con el servicio activo" on public.job_messages;
create policy "chat: escribir con el servicio activo" on public.job_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select auth.uid()) in (private.job_client_id(job_id), private.job_assigned_pro_id(job_id))
    and private.is_active_service(private.job_status(job_id))
  );

create or replace function public.job_exact_address(p_job uuid) returns text
language sql stable security definer set search_path = '' as $$
  select j.exact_address from public.jobs j
  where j.id = p_job and (
    j.client_id = (select auth.uid())
    or (private.job_assigned_pro_id(j.id) = (select auth.uid()) and private.is_active_service(j.status))
  )
$$;

create or replace function public.job_counterpart_phone(p_job uuid) returns text
language sql stable security definer set search_path = '' as $$
  select p.phone from public.jobs j
  join public.profiles p on p.id = case
    when j.client_id = (select auth.uid()) then private.job_assigned_pro_id(j.id)
    when private.job_assigned_pro_id(j.id) = (select auth.uid()) then j.client_id
  end
  where j.id = p_job and private.is_active_service(j.status)
$$;

create or replace function public.job_live_location(p_job uuid)
returns table (latitude float8, longitude float8, recorded_at timestamptz, distance_m int)
language sql stable security definer set search_path = '' as $$
  select extensions.st_y(t.point::extensions.geometry), extensions.st_x(t.point::extensions.geometry), t.recorded_at,
    private.round_distance(extensions.st_distance(t.point, j.approx_point))
  from public.jobs j
  join lateral (select * from public.job_tracks where job_id = j.id order by recorded_at desc limit 1) t on true
  where j.id = p_job and private.is_tracking_status(j.status)
    and (j.client_id = (select auth.uid()) or public.is_staff())
$$;

create or replace function public.job_counterpart(p_job uuid)
returns table (id uuid, name text, rating numeric, phone text)
language sql stable security definer set search_path = '' as $$
  with j as (select jobs.*, private.job_assigned_pro_id(jobs.id) as pro_id from public.jobs where jobs.id = p_job),
  other as (
    select case when (select auth.uid()) = j.client_id then j.pro_id
                when (select auth.uid()) = j.pro_id then j.client_id end as uid, j.status
    from j
  )
  select p.id, private.short_name(p.full_name), private.rating_avg(p.id),
    case when private.is_active_service(other.status) then p.phone end
  from other join public.profiles p on p.id = other.uid
$$;

-- ───────── Reevaluación en sitio ─────────
-- items: [{"name": "...", "qty": 2, "unit_cents": 1590, "catalog_id": "uuid?", "store": "promart?"}]
create function private.items_total(p_items jsonb) returns int
language plpgsql immutable set search_path = '' as $$
declare v_total bigint := 0; v_item jsonb;
begin
  if jsonb_typeof(coalesce(p_items, '[]')) <> 'array' then
    raise exception 'Lista de materiales inválida' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    if (v_item ->> 'qty') !~ '^\d+$' or (v_item ->> 'unit_cents') !~ '^\d+$' or (v_item ->> 'qty')::int <= 0
       or coalesce(btrim(v_item ->> 'name'), '') = '' then
      raise exception 'Cada material necesita nombre, cantidad y precio en céntimos' using errcode = '22023';
    end if;
    v_total := v_total + (v_item ->> 'qty')::bigint * (v_item ->> 'unit_cents')::bigint;
  end loop;
  if v_total > 5000000 then
    raise exception 'Total de materiales fuera de rango' using errcode = '22023';
  end if;
  return v_total::int;
end $$;

create function public.propose_reevaluation(
  p_job uuid, p_labor_cents int, p_materials_by public.materials_provider, p_items jsonb default '[]',
  p_receipt_path text default null
) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare
  v public.jobs;
  v_materials int := private.items_total(p_items);
begin
  v := private.require_assigned_pro(p_job);
  perform private.require_status(v, 'at_home', 'price_renegotiated');
  if p_labor_cents is null or p_labor_cents <= 0 or p_labor_cents > 5000000 then
    raise exception 'Mano de obra inválida' using errcode = '22023';
  end if;
  if p_materials_by = 'client' and v_materials > 0 then
    raise exception 'Si el cliente pone los materiales, no se cobran materiales' using errcode = '22023';
  end if;
  if p_materials_by = 'pro' and v_materials > 0 then
    if p_receipt_path is null or p_receipt_path not like p_job::text || '/%' or not exists (
      select 1 from storage.objects where bucket_id = 'material-receipts' and name = p_receipt_path
    ) then
      raise exception 'Sube la foto de la boleta de los materiales para su reembolso' using errcode = 'P0001';
    end if;
  end if;
  update public.jobs set reeval_labor_cents = p_labor_cents, reeval_materials_cents = v_materials,
    reeval_materials_by = p_materials_by, reeval_items = coalesce(p_items, '[]'), reeval_receipt_path = p_receipt_path,
    reeval_proposed_at = now(), reeval_answered_at = null
  where id = p_job returning * into v;
  return v;
end $$;

-- Aprobar: el pedido pasa a price_renegotiated con el total y el desglose nuevos.
-- Rechazar: se descarta la propuesta; el cliente puede cancelar pagando la tarifa de visita.
create function public.answer_reevaluation(p_job uuid, p_approve boolean) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare v public.jobs;
begin
  v := private.require_client(p_job);
  perform private.require_status(v, 'at_home', 'price_renegotiated');
  if v.reeval_proposed_at is null then
    raise exception 'No hay una reevaluación pendiente' using errcode = 'P0001';
  end if;
  if p_approve then
    update public.jobs set status = 'price_renegotiated',
      labor_cents = v.reeval_labor_cents, materials_cents = v.reeval_materials_cents,
      materials_provided_by = v.reeval_materials_by, materials_items = v.reeval_items,
      materials_receipt_path = v.reeval_receipt_path,
      final_price_cents = v.reeval_labor_cents + v.reeval_materials_cents
    where id = p_job;
  end if;
  update public.jobs set reeval_labor_cents = null, reeval_materials_cents = null, reeval_materials_by = null,
    reeval_items = null, reeval_receipt_path = null, reeval_proposed_at = null, reeval_answered_at = now()
  where id = p_job returning * into v;
  return v;
end $$;

-- Terminado: el monto final es el total; la mano de obra = total − materiales.
create or replace function public.finish_job(p_job uuid, p_final_cents int default null) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare v public.jobs;
begin
  v := private.require_assigned_pro(p_job);
  perform private.require_status(v, 'at_home', 'price_renegotiated');
  if p_final_cents is not null and (p_final_cents <= v.materials_cents or p_final_cents > 5000000) then
    raise exception 'El monto final debe ser mayor que los materiales' using errcode = '22023';
  end if;
  update public.jobs set status = 'finished', finished_at = now(),
    final_proposed_cents = coalesce(p_final_cents, v.final_price_cents),
    reeval_labor_cents = null, reeval_materials_cents = null, reeval_materials_by = null,
    reeval_items = null, reeval_receipt_path = null, reeval_proposed_at = null
  where id = p_job returning * into v;
  return v;
end $$;

-- ───────── Comisión SOLO sobre mano de obra ─────────
create or replace function private.post_commission(p_job uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.jobs;
  v_pro uuid;
  v_amount int;
  v_done int;
begin
  select * into v from public.jobs where id = p_job;
  v_pro := private.job_assigned_pro_id(p_job);
  if v.status not in ('confirmed', 'rated') or v_pro is null then
    raise exception 'Solo se cobra comisión de trabajos confirmados' using errcode = 'P0001';
  end if;
  -- Los materiales quedan 100 % exentos: la base es labor_cents (o el total si no hubo desglose).
  v_amount := private.commission_cents(coalesce(v.labor_cents, v.final_price_cents), v.commission_rate_bps);
  if v_amount <= 0 then
    return;
  end if;
  perform private.wallet_post(v_pro, 'commission_debit', -v_amount, 'job:' || p_job || ':commission', p_job, p_job::text);
  select count(*) into v_done from public.wallet_entries
  where professional_id = v_pro and type = 'commission_debit' and job_id <> p_job and idempotency_key like '%:commission';
  if v_done < private.setting_int('launch_promo_jobs', 0) then
    perform private.wallet_post(v_pro, 'promo_credit', v_amount, 'job:' || p_job || ':promo', p_job, 'promo de lanzamiento');
  end if;
end $$;

create or replace function public.confirm_job(p_job uuid, p_approve boolean default true) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare v public.jobs;
begin
  v := private.require_client(p_job);
  if v.status in ('confirmed', 'rated') and p_approve then
    perform private.post_commission(p_job);
    return v;
  end if;
  perform private.require_status(v, 'finished');
  if not p_approve then
    -- Vuelve al domicilio; si hubo una reevaluación aprobada, a price_renegotiated.
    update public.jobs set final_proposed_cents = null, finished_at = null,
      status = case when v.materials_cents > 0 or coalesce(v.labor_cents, o.price_cents) <> o.price_cents
        then 'price_renegotiated'::public.job_status else 'at_home'::public.job_status end
    from public.offers o
    where jobs.id = p_job and o.id = v.accepted_offer_id
    returning jobs.* into v;
    return v;
  end if;
  update public.jobs set status = 'confirmed', confirmed_at = now(), final_price_cents = v.final_proposed_cents,
    labor_cents = v.final_proposed_cents - v.materials_cents
  where id = p_job returning * into v;
  perform private.post_commission(p_job);
  return v;
end $$;

-- ═════════════════════════ 6. Cancelación con tarifa de visita ═════════════════════════
-- Si el CLIENTE cancela después de que el técnico llegó, debe la tarifa de visita/diagnóstico.
-- Cerquita no cobra al cliente (el pago va directo al pro); se registra el monto y la comisión sobre él.
create or replace function public.cancel_service(p_job uuid, p_reason text) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare
  v public.jobs;
  v_pro uuid;
  v_fee int;
begin
  select * into v from public.jobs where id = p_job for update;
  v_pro := private.job_assigned_pro_id(p_job);
  if not found or (select auth.uid()) not in (v.client_id, coalesce(v_pro, v.client_id)) then
    raise exception 'No participas en este servicio' using errcode = '42501';
  end if;
  perform private.require_status(v, 'published', 'with_offers', 'accepted', 'on_the_way', 'at_home', 'price_renegotiated');
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Cuéntanos el motivo de la cancelación' using errcode = '22023';
  end if;
  if (select auth.uid()) = v.client_id and v.status in ('at_home', 'price_renegotiated') then
    v_fee := private.visit_fee_cents(v.trade_id);
  end if;
  update public.jobs set status = 'cancelled', cancelled_by = auth.uid(), cancel_reason = btrim(p_reason),
    cancelled_at = now(), visit_fee_cents = v_fee
  where id = p_job returning * into v;
  -- Comisión de Cerquita sobre la tarifa de visita (el pro la cobra directo al cliente).
  if coalesce(v_fee, 0) > 0 and private.commission_cents(v_fee, coalesce(v.commission_rate_bps, 1000)) > 0 then
    perform private.wallet_post(v_pro, 'commission_debit',
      -private.commission_cents(v_fee, coalesce(v.commission_rate_bps, private.setting_int('commission_rate_bps', 1000))),
      'job:' || p_job || ':visit', p_job, 'tarifa de visita');
  end if;
  return v;
end $$;

-- delete_my_account considera price_renegotiated como servicio en curso.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Inicia sesión para eliminar tu cuenta' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.jobs j
    where private.is_active_service(j.status) and (j.client_id = v_uid or private.job_assigned_pro_id(j.id) = v_uid)
  ) then
    raise exception 'Tienes un servicio en curso. Termínalo o cancélalo antes de eliminar tu cuenta.' using errcode = 'P0001';
  end if;
  update public.jobs set status = 'cancelled', cancelled_by = v_uid, cancel_reason = 'Cuenta eliminada', cancelled_at = now()
  where client_id = v_uid and status in ('published', 'with_offers');
  update public.offers set status = 'withdrawn' where pro_id = v_uid and status = 'pending';
  delete from public.trusted_contacts where user_id = v_uid;
  delete from public.pro_presence where pro_id = v_uid;
  delete from public.verification_documents where pro_id = v_uid;
  update public.pro_trades set status = 'suspended', reason = 'Cuenta eliminada' where pro_id = v_uid;
  update public.jobs set exact_address = 'Dirección eliminada', photos = '{}' where client_id = v_uid;
  update public.ratings set comment = null where from_id = v_uid;
  delete from public.job_messages where sender_id = v_uid;
  update public.profiles set full_name = null, phone = null, avatar_url = null, deleted_at = now() where id = v_uid;
  update auth.users set phone = null, phone_confirmed_at = null, raw_user_meta_data = '{}'::jsonb,
    banned_until = 'infinity', updated_at = now()
  where id = v_uid;
  delete from auth.refresh_tokens where user_id = v_uid::text;
  delete from auth.sessions where user_id = v_uid;
end $$;

-- nearby_jobs incluye la unidad de cobro (hora/día) para cotizar por tarifa.
drop function public.nearby_jobs();
create function public.nearby_jobs()
returns table (
  id uuid, trade_id smallint, trade_name text, description text, photos text[],
  offered_price_cents int, distance_m int, created_at timestamptz,
  client_name text, client_rating numeric, my_offer_id uuid, my_offer_status public.offer_status,
  my_offer_price_cents int, pricing_unit public.pricing_unit, units smallint, currency_code char(3)
)
language sql stable security definer set search_path = '' as $$
  select j.id, j.trade_id, t.name, j.description, j.photos, j.offered_price_cents,
    private.round_distance(extensions.st_distance(pp.last_point, j.approx_point)),
    j.created_at, private.short_name(p.full_name), private.rating_avg(j.client_id),
    o.id, o.status, o.price_cents, j.pricing_unit, j.units, j.currency_code
  from public.jobs j
  join public.trades t on t.id = j.trade_id
  join public.profiles p on p.id = j.client_id
  join public.pro_presence pp on pp.pro_id = (select auth.uid())
  left join public.offers o on o.job_id = j.id and o.pro_id = (select auth.uid())
  where j.status in ('published', 'with_offers')
    and j.client_id <> (select auth.uid())
    and private.pro_is_eligible(j.trade_id, j.approx_point)
  order by 7, j.created_at desc
$$;
grant execute on function public.nearby_jobs() to authenticated;

-- ═════════════════════════ 7. Boletas de materiales (bucket privado) ═════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('material-receipts', 'material-receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;
create policy "boletas: sube el pro asignado" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'material-receipts'
    and private.job_assigned_pro_id(private.try_uuid((storage.foldername(name))[1])) = (select auth.uid())
  );
create policy "boletas: ven cliente, pro y soporte" on storage.objects for select to authenticated
  using (
    bucket_id = 'material-receipts' and (
      (select auth.uid()) in (
        private.job_client_id(private.try_uuid((storage.foldername(name))[1])),
        private.job_assigned_pro_id(private.try_uuid((storage.foldername(name))[1]))
      ) or public.is_staff()
    )
  );

create or replace function public.storage_orphans(p_min_age interval default interval '1 day')
returns table (bucket_id text, name text)
language sql stable security definer set search_path = '' as $$
  select o.bucket_id, o.name from storage.objects o
  where o.created_at < now() - p_min_age
    and case o.bucket_id
      when 'verification' then not exists (select 1 from public.verification_documents d where d.storage_path = o.name)
      when 'job-photos' then not exists (select 1 from public.jobs j where o.name = any (j.photos))
      when 'payment-proofs' then not exists (select 1 from public.payment_proofs p where p.image_path = o.name)
      when 'material-receipts' then not exists (
        select 1 from public.jobs j where o.name in (j.materials_receipt_path, j.reeval_receipt_path)
      )
      when 'avatars' then exists (
        select 1 from public.profiles p
        where p.id = private.try_uuid((storage.foldername(o.name))[1]) and p.deleted_at is not null
      )
      else false
    end
  order by o.bucket_id, o.name
$$;

-- ═════════════════════════ 8. Antifraude: sospecha de bypass por GPS ═════════════════════════
-- Sin historial: solo la última posición del pro EN LÍNEA (el documento técnico lo permite: “solo el
-- servidor”) y desde cuándo no se mueve más de 100 m.
alter table public.pro_presence add column still_since timestamptz;

create function public.update_presence(p_lat float8, p_lng float8) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_point extensions.geography := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
begin
  update public.pro_presence set
    still_since = case when last_point is null or extensions.st_distance(last_point, v_point) > 100 then now() else coalesce(still_since, now()) end,
    last_point = v_point
  where pro_id = (select auth.uid()) and online;
end $$;
grant execute on function public.update_presence(float8, float8) to authenticated;

create table public.bypass_suspicions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs (id) on delete cascade,
  pro_id uuid not null references public.profiles (id),
  detected_at timestamptz not null default now(),
  distance_m int not null,
  minutes_on_site int not null,
  status public.bypass_status not null default 'open',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  note text
);
create index on public.bypass_suspicions (pro_id, detected_at);
alter table public.bypass_suspicions enable row level security;
grant select on public.bypass_suspicions to authenticated;
create policy "bypass: solo soporte" on public.bypass_suspicions for select to authenticated using (public.is_staff());

-- Pedido cancelado + el pro sigue ≥ N min a menos de R m del cliente → sospecha.
-- 2 sospechas (no descartadas) en 7 días suspenden sus oficios aprobados.
create function private.detect_bypass(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_minutes int := private.setting_int('bypass_minutes', 15);
  v_radius int := private.setting_int('bypass_radius_m', 150);
  v_max int := private.setting_int('bypass_max_per_week', 2);
  v_new int := 0;
  r record;
begin
  for r in
    select j.id as job_id, o.pro_id,
      private.round_distance(extensions.st_distance(pp.last_point, j.approx_point)) as dist,
      floor(extract(epoch from (pp.updated_at - greatest(pp.still_since, j.cancelled_at))) / 60)::int as mins
    from public.jobs j
    join public.offers o on o.id = j.accepted_offer_id
    join public.pro_presence pp on pp.pro_id = o.pro_id
    where j.status = 'cancelled' and j.cancelled_at between p_now - interval '12 hours' and p_now
      and pp.last_point is not null and pp.still_since is not null
      and pp.still_since <= j.cancelled_at + interval '2 minutes'
      and pp.updated_at >= j.cancelled_at + make_interval(mins => v_minutes)
      and extensions.st_dwithin(pp.last_point, j.approx_point, v_radius)
      and not exists (select 1 from public.bypass_suspicions s where s.job_id = j.id)
  loop
    insert into public.bypass_suspicions (job_id, pro_id, distance_m, minutes_on_site, detected_at)
    values (r.job_id, r.pro_id, r.dist, r.mins, p_now);
    v_new := v_new + 1;
    if (select count(*) from public.bypass_suspicions
        where pro_id = r.pro_id and status <> 'dismissed' and detected_at > p_now - interval '7 days') >= v_max then
      update public.pro_trades set status = 'suspended', reason = 'Sospecha de bypass: pagos fuera de la app'
      where pro_id = r.pro_id and status in ('approved_observation', 'approved_full');
      update public.pro_presence set online = false where pro_id = r.pro_id;
    end if;
  end loop;
  return v_new;
end $$;

select cron.schedule('detect-bypass', '*/5 * * * *', $$select private.detect_bypass()$$);

-- Panel: cola de sospechas y revisión.
create function public.bypass_queue()
returns table (id uuid, detected_at timestamptz, status public.bypass_status, pro_id uuid, pro_name text,
  job_id uuid, job_description text, distance_m int, minutes_on_site int, week_count int, pro_suspended boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, s.detected_at, s.status, s.pro_id, p.full_name, s.job_id, j.description, s.distance_m, s.minutes_on_site,
    (select count(*)::int from public.bypass_suspicions x where x.pro_id = s.pro_id and x.status <> 'dismissed'
       and x.detected_at > now() - interval '7 days'),
    exists (select 1 from public.pro_trades pt where pt.pro_id = s.pro_id and pt.reason like 'Sospecha de bypass%' and pt.status = 'suspended')
  from public.bypass_suspicions s
  join public.profiles p on p.id = s.pro_id
  join public.jobs j on j.id = s.job_id
  where public.is_staff()
  order by s.status = 'open' desc, s.detected_at desc
$$;
grant execute on function public.bypass_queue() to authenticated;

create function public.review_bypass(p_id uuid, p_confirm boolean, p_note text) returns public.bypass_suspicions
language plpgsql security definer set search_path = '' as $$
declare v public.bypass_suspicions;
begin
  if not public.is_staff() then
    raise exception 'Solo soporte revisa sospechas' using errcode = '42501';
  end if;
  if nullif(btrim(p_note), '') is null then
    raise exception 'Escribe una nota' using errcode = '22023';
  end if;
  update public.bypass_suspicions set status = case when p_confirm then 'confirmed'::public.bypass_status else 'dismissed' end,
    reviewed_by = auth.uid(), reviewed_at = now(), note = btrim(p_note)
  where id = p_id returning * into v;
  if not found then
    raise exception 'Sospecha no encontrada' using errcode = 'P0002';
  end if;
  -- Si se descarta y ya no llega al máximo, se levanta la suspensión automática (vuelve a observación).
  if not p_confirm and (select count(*) from public.bypass_suspicions where pro_id = v.pro_id and status <> 'dismissed'
      and detected_at > now() - interval '7 days') < private.setting_int('bypass_max_per_week', 2) then
    update public.pro_trades set status = 'approved_observation', reason = null
    where pro_id = v.pro_id and status = 'suspended' and reason like 'Sospecha de bypass%';
  end if;
  return v;
end $$;
grant execute on function public.review_bypass(uuid, boolean, text) to authenticated;
