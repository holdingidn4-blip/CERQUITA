-- F3 · Cotización con desglose, aceptación con versión y cierre.
-- · La oferta lleva desglose: visita, mano de obra, materiales y movilidad (topes para que no se
--   pase mano de obra a otros rubros). El total lo calcula el servidor. Sin desglose (apps viejas)
--   todo cuenta como mano de obra.
-- · Aceptar ("Acepto") guarda monto, desglose, fecha, hora, versión y versión de los términos.
--   Todo cambio de precio es una cotización nueva (reevaluación) con su propia aceptación;
--   "Terminado" ya no cambia el monto.
-- · Comisión solo sobre la mano de obra aceptada (visita, movilidad y materiales no pagan).
-- · Fotos antes y después obligatorias para terminar; van al portafolio del pro solo si el cliente lo
--   permite (y puede retirarlo).
-- · Profesional que no llega: cupón para el cliente que asume la plataforma (tope mensual), y
--   advertencia al pro con apelación.

insert into public.settings (key, scope, value) values
  ('quote_terms_version', 'global', '"2026-11-23"'),
  ('quote_max_transport_cents', 'global', '2000'),
  ('no_show_coupon_cents', 'global', '1000'),
  ('no_show_coupon_monthly_cap_cents', 'global', '50000'),
  ('coupon_valid_days', 'global', '60'),
  ('no_show_appeal_days', 'global', '7')
on conflict (key, scope) do nothing;

-- ═════════════ Desglose de la cotización ═════════════
alter table public.offers
  add column visit_cents int check (visit_cents >= 0),
  add column labor_cents int check (labor_cents >= 0),
  add column materials_cents int check (materials_cents >= 0),
  add column transport_cents int check (transport_cents >= 0);
grant insert (visit_cents, labor_cents, materials_cents, transport_cents),
  update (visit_cents, labor_cents, materials_cents, transport_cents) on public.offers to authenticated;

create function private.apply_offer_breakdown() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_visit_max int;
  v_transport_max int := private.setting_int('quote_max_transport_cents', 2000);
begin
  if new.labor_cents is null and coalesce(new.visit_cents, new.materials_cents, new.transport_cents) is null then
    -- Sin desglose (versiones anteriores de la app): todo es mano de obra.
    new.labor_cents := new.price_cents;
    new.visit_cents := 0;
    new.materials_cents := 0;
    new.transport_cents := 0;
    return new;
  end if;
  new.visit_cents := coalesce(new.visit_cents, 0);
  new.labor_cents := coalesce(new.labor_cents, 0);
  new.materials_cents := coalesce(new.materials_cents, 0);
  new.transport_cents := coalesce(new.transport_cents, 0);
  if new.labor_cents < 100 then
    raise exception 'La mano de obra debe ser de al menos S/ 1' using errcode = '22023';
  end if;
  v_visit_max := coalesce(private.job_visit_fee_cents(new.job_id), private.setting_int('default_visit_fee_cents', 3000));
  if new.visit_cents > v_visit_max then
    raise exception 'La visita no puede pasar de S/ %', to_char(v_visit_max / 100.0, 'FM999990.00') using errcode = '22023';
  end if;
  if new.transport_cents > v_transport_max then
    raise exception 'La movilidad no puede pasar de S/ %', to_char(v_transport_max / 100.0, 'FM999990.00') using errcode = '22023';
  end if;
  new.price_cents := new.visit_cents + new.labor_cents + new.materials_cents + new.transport_cents;
  return new;
end $$;
-- "apply…" corre antes que "check_offer_rate" (los triggers van en orden alfabético).
create trigger apply_offer_breakdown before insert or update of price_cents, visit_cents, labor_cents, materials_cents, transport_cents
  on public.offers for each row execute function private.apply_offer_breakdown();

-- Las ofertas existentes quedan como mano de obra.
update public.offers set labor_cents = price_cents, visit_cents = 0, materials_cents = 0, transport_cents = 0
where labor_cents is null;

drop function public.job_offers(uuid);
create function public.job_offers(p_job uuid)
returns table (
  id uuid, pro_id uuid, price_cents int, message text, status public.offer_status, created_at timestamptz,
  pro_name text, avatar_url text, rating_avg numeric, jobs_done int, distance_m int, eta_minutes smallint,
  visit_cents int, labor_cents int, materials_cents int, transport_cents int
)
language sql stable security definer set search_path = '' as $$
  select o.id, o.pro_id, o.price_cents, o.message, o.status, o.created_at,
    private.short_name(p.full_name), p.avatar_url, private.rating_avg(o.pro_id), private.jobs_done(o.pro_id),
    case when pp.last_point is not null
      then private.round_distance(extensions.st_distance(pp.last_point, j.approx_point)) end,
    o.eta_minutes, o.visit_cents, o.labor_cents, o.materials_cents, o.transport_cents
  from public.offers o
  join public.jobs j on j.id = o.job_id
  join public.profiles p on p.id = o.pro_id
  left join public.pro_presence pp on pp.pro_id = o.pro_id
  where o.job_id = p_job and j.client_id = (select auth.uid()) and o.status in ('pending', 'accepted')
  order by o.price_cents, o.created_at
$$;
revoke execute on function public.job_offers(uuid) from public, anon;
grant execute on function public.job_offers(uuid) to authenticated;

-- ═════════════ Pedido: rubros acordados, versión y cupón ═════════════
alter table public.jobs
  add column visit_cents int not null default 0 check (visit_cents >= 0),
  add column transport_cents int not null default 0 check (transport_cents >= 0),
  add column quote_version smallint not null default 0,
  add column coupon_id uuid,
  add column coupon_discount_cents int not null default 0 check (coupon_discount_cents >= 0);
grant select (visit_cents, transport_cents, quote_version, coupon_id, coupon_discount_cents) on public.jobs to authenticated;

-- ═════════════ Aceptaciones (inmutables) ═════════════
create table public.quote_acceptances (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  offer_id uuid references public.offers (id) on delete set null,
  version smallint not null check (version >= 1),
  source text not null check (source in ('offer', 'reevaluation')),
  visit_cents int not null,
  labor_cents int not null,
  materials_cents int not null,
  transport_cents int not null,
  total_cents int not null,
  terms_version text not null,
  accepted_by uuid not null references public.profiles (id),
  accepted_at timestamptz not null default now(),
  unique (job_id, version)
);
create index on public.quote_acceptances (offer_id);
create index on public.quote_acceptances (accepted_by);
alter table public.quote_acceptances enable row level security;
grant select on public.quote_acceptances to authenticated;
create policy "aceptaciones: partes del pedido o soporte" on public.quote_acceptances for select to authenticated
  using (
    public.is_staff()
    or (select auth.uid()) in (private.job_client_id(job_id), private.job_assigned_pro_id(job_id))
  );

create function private.record_acceptance(p_job uuid, p_offer uuid, p_source text) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.jobs;
begin
  select * into v from public.jobs where id = p_job;
  insert into public.quote_acceptances (job_id, offer_id, version, source, visit_cents, labor_cents, materials_cents,
    transport_cents, total_cents, terms_version, accepted_by)
  values (p_job, p_offer, v.quote_version, p_source, v.visit_cents, coalesce(v.labor_cents, 0), v.materials_cents,
    v.transport_cents, v.final_price_cents, private.setting_text('quote_terms_version', 'sin-version'), v.client_id);
end $$;

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
      labor_cents = coalesce(v_offer.labor_cents, v_offer.price_cents),
      materials_cents = coalesce(v_offer.materials_cents, 0),
      materials_provided_by = case when coalesce(v_offer.materials_cents, 0) > 0
        then 'pro'::public.materials_provider else 'client'::public.materials_provider end,
      visit_cents = coalesce(v_offer.visit_cents, 0),
      transport_cents = coalesce(v_offer.transport_cents, 0),
      quote_version = quote_version + 1,
      commission_rate_bps = private.setting_int('commission_rate_bps', 1000),
      assigned_at = now(),
      promised_arrival_at = case
        when v_job.scheduled_for is null
          then now() + make_interval(mins => coalesce(v_offer.eta_minutes, private.setting_int('default_eta_minutes', 60)))
        else greatest(v_job.scheduled_for, now() + make_interval(mins => coalesce(v_offer.eta_minutes, 0)))
      end
  where id = v_job.id
  returning * into v_job;
  perform private.record_acceptance(v_job.id, p_offer, 'offer');
  return v_job;
end $$;

create or replace function public.answer_reevaluation(p_job uuid, p_approve boolean) returns public.jobs
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
      final_price_cents = v.reeval_labor_cents + v.reeval_materials_cents + v.visit_cents + v.transport_cents,
      quote_version = quote_version + 1
    where id = p_job;
    perform private.record_acceptance(p_job, v.accepted_offer_id, 'reevaluation');
  end if;
  update public.jobs set reeval_labor_cents = null, reeval_materials_cents = null, reeval_materials_by = null,
    reeval_items = null, reeval_receipt_path = null, reeval_proposed_at = null, reeval_answered_at = now()
  where id = p_job returning * into v;
  return v;
end $$;

-- ═════════════ Fotos del trabajo (antes / después) y portafolio ═════════════
create table public.job_work_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  kind text not null check (kind in ('before', 'after')),
  storage_path text not null unique,
  uploaded_by uuid not null default auth.uid() references public.profiles (id),
  portfolio_allowed boolean not null default false,
  portfolio_changed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.job_work_photos (job_id, kind);
create index on public.job_work_photos (uploaded_by) where portfolio_allowed;
alter table public.job_work_photos enable row level security;
grant select, insert (job_id, kind, storage_path) on public.job_work_photos to authenticated;
create policy "fotos del trabajo: partes del pedido, soporte o portafolio permitido" on public.job_work_photos
  for select to authenticated
  using (portfolio_allowed or exists (select 1 from public.jobs j where j.id = job_id));
create policy "fotos del trabajo: el pro asignado las sube en el domicilio" on public.job_work_photos
  for insert to authenticated
  with check (
    private.job_assigned_pro_id(job_id) = (select auth.uid())
    and storage_path like job_id::text || '/%'
    and exists (select 1 from public.jobs j where j.id = job_id and j.status in ('at_home', 'price_renegotiated'))
  );

create policy "job-photos: el pro asignado sube fotos del trabajo" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'job-photos'
    and private.job_assigned_pro_id(private.try_uuid((storage.foldername(name))[1])) = (select auth.uid())
  );
create policy "job-photos: portafolio permitido por el cliente" on storage.objects for select to authenticated
  using (
    bucket_id = 'job-photos'
    and exists (select 1 from public.job_work_photos w where w.storage_path = name and w.portfolio_allowed)
  );

create function public.set_portfolio_permission(p_job uuid, p_allowed boolean) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v public.jobs;
  v_count int;
begin
  v := private.require_client(p_job);
  perform private.require_status(v, 'confirmed', 'rated');
  update public.job_work_photos set portfolio_allowed = coalesce(p_allowed, false), portfolio_changed_at = now()
  where job_id = p_job;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function public.set_portfolio_permission(uuid, boolean) from public, anon;
grant execute on function public.set_portfolio_permission(uuid, boolean) to authenticated;

create function public.pro_portfolio(p_pro uuid)
returns table (storage_path text, kind text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select w.storage_path, w.kind, w.created_at
  from public.job_work_photos w
  where w.uploaded_by = p_pro and w.portfolio_allowed and (select auth.uid()) is not null
  order by w.created_at desc
  limit 12
$$;
revoke execute on function public.pro_portfolio(uuid) from public, anon;
grant execute on function public.pro_portfolio(uuid) to authenticated;

-- Las fotos del trabajo no son huérfanas para la limpieza de Storage.
create or replace function public.storage_orphans(p_min_age interval default interval '1 day')
returns table (bucket_id text, name text)
language sql stable security definer set search_path = '' as $$
  select o.bucket_id, o.name from storage.objects o
  where case o.bucket_id
      when 'temp_media' then o.created_at < now() - make_interval(hours => private.setting_int('temp_media_hours', 48))
      else o.created_at < now() - p_min_age and case o.bucket_id
        when 'verification' then not exists (select 1 from public.verification_documents d where d.storage_path = o.name)
        when 'job-photos' then not exists (select 1 from public.jobs j where o.name = any (j.photos))
          and not exists (select 1 from public.job_work_photos w where w.storage_path = o.name)
        when 'payment-proofs' then not exists (select 1 from public.payment_proofs p where p.image_path = o.name)
        when 'material-receipts' then not exists (
          select 1 from public.jobs j where o.name in (j.materials_receipt_path, j.reeval_receipt_path))
        when 'avatars' then exists (
          select 1 from public.profiles p
          where p.id = private.try_uuid((storage.foldername(o.name))[1]) and p.deleted_at is not null)
        else false
      end
    end
  order by o.bucket_id, o.name
$$;

-- ═════════════ Terminar: sin cambiar el precio y con fotos ═════════════
create or replace function public.finish_job(p_job uuid, p_final_cents int default null) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare v public.jobs;
begin
  v := private.require_assigned_pro(p_job);
  perform private.require_status(v, 'at_home', 'price_renegotiated');
  if p_final_cents is not null and p_final_cents <> v.final_price_cents then
    raise exception 'Si el precio cambia, envía una nueva cotización (Reevaluar en sitio) y espera que el cliente la acepte'
      using errcode = 'P0001';
  end if;
  if v.reeval_proposed_at is not null then
    raise exception 'Espera la respuesta del cliente a tu nueva cotización' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.job_work_photos where job_id = p_job and kind = 'before')
     or not exists (select 1 from public.job_work_photos where job_id = p_job and kind = 'after') then
    raise exception 'Sube al menos una foto de antes y una de después del trabajo' using errcode = 'P0001';
  end if;
  update public.jobs set status = 'finished', finished_at = now(), final_proposed_cents = v.final_price_cents
  where id = p_job returning * into v;
  return v;
end $$;

-- ═════════════ Cupón por profesional que no llega ═════════════
create table public.client_coupons (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  reason text not null,
  source_job_id uuid references public.jobs (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_job_id uuid references public.jobs (id) on delete set null,
  used_at timestamptz
);
create index on public.client_coupons (client_id, used_at, expires_at);
create index on public.client_coupons (source_job_id);
create index on public.client_coupons (used_job_id);
alter table public.client_coupons enable row level security;
grant select on public.client_coupons to authenticated;
create policy "cupones: los propios o soporte" on public.client_coupons for select to authenticated
  using (client_id = (select auth.uid()) or public.is_staff());
alter table public.jobs add constraint jobs_coupon_id_fkey foreign key (coupon_id) references public.client_coupons (id);
create index on public.jobs (coupon_id);

-- ═════════════ Apelación de llegadas incumplidas ═════════════
alter table public.pro_no_shows
  add column appeal_text text check (char_length(appeal_text) <= 500),
  add column appealed_at timestamptz,
  add column appeal_status text check (appeal_status in ('pending', 'accepted', 'rejected')),
  add column appeal_note text check (char_length(appeal_note) <= 500),
  add column appeal_reviewed_by uuid references public.profiles (id),
  add column appeal_reviewed_at timestamptz;
create index on public.pro_no_shows (appeal_reviewed_by);
create index on public.pro_no_shows (appeal_status) where appeal_status = 'pending';

-- Al registrar la falta: cupón para el cliente (si alcanza el tope del mes) y advertencia al pro.
create function private.on_no_show_recorded() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_client uuid := private.job_client_id(new.job_id);
  v_amount int := private.setting_int('no_show_coupon_cents', 1000);
  v_cap int := private.setting_int('no_show_coupon_monthly_cap_cents', 50000);
  v_month int;
begin
  select coalesce(sum(amount_cents), 0) into v_month from public.client_coupons
  where reason = 'no_show' and date_trunc('month', created_at at time zone 'America/Lima')
    = date_trunc('month', now() at time zone 'America/Lima');
  if v_amount > 0 and v_month + v_amount <= v_cap then
    insert into public.client_coupons (client_id, amount_cents, reason, source_job_id, expires_at)
    values (v_client, v_amount, 'no_show', new.job_id,
      now() + make_interval(days => private.setting_int('coupon_valid_days', 60)));
    perform private.notify(v_client, 'coupon_granted', 'Te damos un cupón de S/ ' || to_char(v_amount / 100.0, 'FM999990.00'),
      'Disculpa la demora. Úsalo al confirmar tu próximo servicio.', jsonb_build_object('url', '/inicio'));
  end if;
  perform private.notify(new.pro_id, 'no_show_warning', 'Advertencia: llegada incumplida',
    'Si no fue tu culpa, puedes apelar en ' || private.setting_int('no_show_appeal_days', 7) || ' días desde Solicitudes.',
    jsonb_build_object('url', '/llegadas'));
  return new;
end $$;
create trigger on_no_show_recorded after insert on public.pro_no_shows
  for each row execute function private.on_no_show_recorded();

create function public.appeal_no_show(p_no_show uuid, p_text text) returns public.pro_no_shows
language plpgsql security definer set search_path = '' as $$
declare
  v public.pro_no_shows;
  v_text text := nullif(btrim(p_text), '');
begin
  select * into v from public.pro_no_shows where id = p_no_show and pro_id = (select auth.uid()) for update;
  if not found then
    raise exception 'Llegada incumplida no encontrada' using errcode = 'P0002';
  end if;
  if v.appeal_status is not null then
    raise exception 'Ya apelaste esta llegada incumplida' using errcode = 'P0001';
  end if;
  if v.reported_at < now() - make_interval(days => private.setting_int('no_show_appeal_days', 7)) then
    raise exception 'El plazo para apelar ya pasó' using errcode = 'P0001';
  end if;
  if v_text is null or char_length(v_text) < 10 then
    raise exception 'Cuéntanos qué pasó (al menos 10 letras)' using errcode = '22023';
  end if;
  update public.pro_no_shows set appeal_text = v_text, appealed_at = now(), appeal_status = 'pending'
  where id = p_no_show returning * into v;
  return v;
end $$;
revoke execute on function public.appeal_no_show(uuid, text) from public, anon;
grant execute on function public.appeal_no_show(uuid, text) to authenticated;

create function public.review_no_show_appeal(p_no_show uuid, p_accept boolean, p_note text) returns public.pro_no_shows
language plpgsql security definer set search_path = '' as $$
declare
  v public.pro_no_shows;
  v_note text := nullif(btrim(p_note), '');
begin
  if not public.is_staff() then
    raise exception 'Solo soporte revisa apelaciones' using errcode = '42501';
  end if;
  select * into v from public.pro_no_shows where id = p_no_show for update;
  if not found or v.appeal_status is distinct from 'pending' then
    raise exception 'No hay una apelación pendiente' using errcode = 'P0001';
  end if;
  if v_note is null then
    raise exception 'Escribe el motivo de la decisión' using errcode = '22023';
  end if;
  update public.pro_no_shows
  set appeal_status = case when p_accept then 'accepted' else 'rejected' end,
      appeal_note = v_note, appeal_reviewed_by = auth.uid(), appeal_reviewed_at = now()
  where id = p_no_show returning * into v;
  perform private.notify(v.pro_id, 'no_show_appeal', case when p_accept
      then 'Aceptamos tu apelación' else 'No aceptamos tu apelación' end,
    case when p_accept then 'La llegada incumplida ya no cuenta para la pausa.' else v_note end,
    jsonb_build_object('url', '/llegadas'));
  return v;
end $$;
revoke execute on function public.review_no_show_appeal(uuid, boolean, text) from public, anon;
grant execute on function public.review_no_show_appeal(uuid, boolean, text) to authenticated;

-- Una apelación aceptada ya no cuenta para la pausa.
create or replace function private.no_show_count(p_pro uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.pro_no_shows
  where pro_id = p_pro
    and appeal_status is distinct from 'accepted'
    and reported_at > now() - make_interval(days => private.setting_int('no_show_window_days', 30))
$$;

-- Aplicar el cupón al confirmar (como los puntos): el cliente paga menos y la plataforma se lo abona al pro.
create function public.apply_coupon(p_job uuid, p_coupon uuid) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare
  v public.jobs;
  c public.client_coupons;
  v_labor int;
begin
  v := private.require_client(p_job);
  perform private.require_status(v, 'finished');
  if p_coupon is null then
    update public.jobs set coupon_id = null, coupon_discount_cents = 0 where id = p_job returning * into v;
    return v;
  end if;
  select * into c from public.client_coupons
  where id = p_coupon and client_id = v.client_id and used_at is null and expires_at > now();
  if not found then
    raise exception 'Ese cupón no está disponible' using errcode = 'P0001';
  end if;
  v_labor := coalesce(v.final_proposed_cents, v.final_price_cents) - v.materials_cents - v.points_discount_cents;
  update public.jobs set coupon_id = c.id, coupon_discount_cents = greatest(0, least(c.amount_cents, v_labor))
  where id = p_job returning * into v;
  return v;
end $$;
revoke execute on function public.apply_coupon(uuid, uuid) from public, anon;
grant execute on function public.apply_coupon(uuid, uuid) to authenticated;

create or replace function public.confirm_job(p_job uuid, p_approve boolean default true) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare
  v public.jobs;
  v_pro uuid;
begin
  v := private.require_client(p_job);
  if v.status in ('confirmed', 'rated') and p_approve then
    perform private.post_commission(p_job);
    perform private.settle_points(p_job);
    return v;
  end if;
  perform private.require_status(v, 'finished');
  if not p_approve then
    update public.jobs set final_proposed_cents = null, finished_at = null, points_redeemed = 0, points_discount_cents = 0,
      coupon_id = null, coupon_discount_cents = 0,
      status = case when v.quote_version > 1 then 'price_renegotiated'::public.job_status else 'at_home'::public.job_status end
    where jobs.id = p_job
    returning jobs.* into v;
    return v;
  end if;
  update public.jobs set status = 'confirmed', confirmed_at = now(), final_price_cents = v.final_proposed_cents,
    labor_cents = greatest(0, v.final_proposed_cents - v.materials_cents - v.visit_cents - v.transport_cents)
  where id = p_job returning * into v;
  perform private.post_commission(p_job);
  perform private.settle_points(p_job);
  if v.coupon_id is not null and v.coupon_discount_cents > 0 then
    v_pro := private.job_assigned_pro_id(p_job);
    update public.client_coupons set used_job_id = p_job, used_at = now() where id = v.coupon_id and used_at is null;
    perform private.wallet_post(v_pro, 'promo_credit', v.coupon_discount_cents, 'job:' || p_job || ':coupon',
      p_job, 'cupón de Cerquita al cliente');
  end if;
  return v;
end $$;

-- ═════════════ Datos del comprobante (PDF que comparte la app) ═════════════
create function public.job_receipt(p_job uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'job_id', j.id,
    'code', upper(left(j.id::text, 8)),
    'trade', t.name,
    'description', left(j.description, 140),
    'status', j.status,
    'confirmed_at', j.confirmed_at,
    'pro_name', private.short_name(pp.full_name),
    'client_name', private.short_name(cp.full_name),
    'visit_cents', j.visit_cents,
    'labor_cents', coalesce(j.labor_cents, 0),
    'materials_cents', j.materials_cents,
    'transport_cents', j.transport_cents,
    'points_discount_cents', j.points_discount_cents,
    'coupon_discount_cents', j.coupon_discount_cents,
    'total_cents', coalesce(j.final_price_cents, 0),
    'to_pay_cents', greatest(0, coalesce(j.final_price_cents, 0) - j.points_discount_cents - j.coupon_discount_cents),
    'acceptance', (
      select jsonb_build_object('version', a.version, 'accepted_at', a.accepted_at, 'terms_version', a.terms_version)
      from public.quote_acceptances a where a.job_id = j.id order by a.version desc limit 1
    )
  )
  from public.jobs j
  join public.trades t on t.id = j.trade_id
  join public.profiles cp on cp.id = j.client_id
  left join public.profiles pp on pp.id = private.job_assigned_pro_id(j.id)
  where j.id = p_job
    and j.status in ('finished', 'confirmed', 'rated')
    and ((select auth.uid()) in (j.client_id, private.job_assigned_pro_id(j.id)) or public.is_staff())
$$;
revoke execute on function public.job_receipt(uuid) from public, anon;
grant execute on function public.job_receipt(uuid) to authenticated;

-- ═════════════ Corrección: materiales sin cantidad o precio ═════════════
-- Antes, un material sin "qty" o "unit_cents" pasaba la validación (comparar con null no es verdadero)
-- y el total quedaba nulo.
create or replace function private.items_total(p_items jsonb) returns int
language plpgsql immutable set search_path = '' as $$
declare v_total bigint := 0; v_item jsonb;
begin
  if jsonb_typeof(coalesce(p_items, '[]')) <> 'array' then
    raise exception 'Lista de materiales inválida' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    if coalesce(v_item ->> 'qty', '') !~ '^\d+$' or coalesce(v_item ->> 'unit_cents', '') !~ '^\d+$'
       or (v_item ->> 'qty')::int <= 0
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
