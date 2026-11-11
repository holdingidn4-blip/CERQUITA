-- Módulo final del piloto: Maestro en el catálogo, lista negra de direcciones, diagnóstico exprés por
-- video (temporal 48 h), visita de diagnóstico, chat 100 % interno con filtro antifraude,
-- Puntos Cerquita, ranking de profesionales y reclamos con acceso auditado a la identidad.

-- ═════════════════════════ Parámetros (regla 9) ═════════════════════════
insert into public.settings (key, scope, value) values
  ('diagnostic_visit_fee_cents', 'city:huancayo', '2000'), -- Visita de diagnóstico presencial: S/ 20
  ('temp_media_hours', 'global', '48'),
  ('max_video_seconds', 'global', '15'),
  ('blacklist_radius_m', 'global', '100'),
  ('points_per_sol', 'global', '1'),          -- 1 punto por cada S/ 1 de mano de obra confirmada
  ('point_value_cents', 'global', '5'),       -- 1 punto = S/ 0.05 de descuento
  ('max_points_discount_pct', 'global', '20') -- tope: 20 % de la mano de obra
on conflict (key, scope) do nothing;

-- ═════════════════════════ Catálogo: + Maestro ═════════════════════════
alter table public.materials_catalog drop constraint materials_catalog_store_check;
alter table public.materials_catalog add constraint materials_catalog_store_check
  check (store in ('promart', 'sodimac', 'maestro', 'ferreteria', 'otro'));

-- ═════════════════════════ Lista negra de direcciones ═════════════════════════
-- Solo soporte la gestiona; los técnicos ven un aviso discreto (nunca el motivo ni el punto exacto).
-- El cliente no lo ve.
create table public.blacklisted_locations (
  id uuid primary key default gen_random_uuid(),
  point extensions.geography(point, 4326) not null,
  address_text text check (char_length(address_text) <= 300),
  reason text not null check (char_length(reason) between 3 and 300),
  severity smallint not null default 1 check (severity between 1 and 3),
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.blacklisted_locations using gist (point) where active;
alter table public.blacklisted_locations enable row level security;
grant select, insert, update on public.blacklisted_locations to authenticated;
create policy "lista negra: solo soporte" on public.blacklisted_locations for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create function private.location_caution(p_point extensions.geography) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blacklisted_locations b
    where b.active and extensions.st_dwithin(b.point, p_point, private.setting_int('blacklist_radius_m', 100))
  )
$$;

-- Aviso para el profesional que ve el pedido o lo tiene asignado. Para cualquier otro: null.
create function public.job_caution(p_job uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.location_caution(j.approx_point) from public.jobs j
  where j.id = p_job and j.client_id <> (select auth.uid()) and (
    private.job_assigned_pro_id(j.id) = (select auth.uid())
    or (j.status in ('published', 'with_offers') and private.pro_is_eligible(j.trade_id, j.approx_point))
  )
$$;
grant execute on function public.job_caution(uuid) to authenticated;

-- ═════════════════════════ Diagnóstico exprés por video + visita de diagnóstico ═════════════════════════
alter table public.jobs
  add column video_path text,
  add column video_seconds smallint check (video_seconds between 1 and 60),
  add column video_uploaded_at timestamptz,
  add column diagnostic_visit boolean not null default false;
grant select (video_path, video_seconds, video_uploaded_at, diagnostic_visit) on public.jobs to authenticated;
grant insert (diagnostic_visit) on public.jobs to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('temp_media', 'temp_media', false, 26214400, array['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Sube el cliente a temp_media/<pedido>/…; lo ve quien puede ver el pedido, solo durante 48 h.
create policy "temp_media: sube el cliente de su pedido" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'temp_media'
    and private.job_client_id(private.try_uuid((storage.foldername(name))[1])) = (select auth.uid())
  );
create policy "temp_media: ver 48 h si veo el pedido" on storage.objects for select to authenticated
  using (
    bucket_id = 'temp_media'
    and created_at > now() - make_interval(hours => private.setting_int('temp_media_hours', 48))
    and exists (select 1 from public.jobs j where j.id = private.try_uuid((storage.foldername(name))[1]))
  );

-- Registra el video del pedido (máx. 15 s, lo declara la app; el archivo debe existir en temp_media).
create function public.attach_job_video(p_job uuid, p_path text, p_seconds int) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare v public.jobs;
begin
  v := private.require_client(p_job);
  perform private.require_status(v, 'published', 'with_offers');
  if p_seconds is null or p_seconds < 1 or p_seconds > private.setting_int('max_video_seconds', 15) then
    raise exception 'El video debe durar como máximo % segundos', private.setting_int('max_video_seconds', 15) using errcode = '22023';
  end if;
  if p_path not like p_job::text || '/%'
     or not exists (select 1 from storage.objects where bucket_id = 'temp_media' and name = p_path) then
    raise exception 'Sube el video a la carpeta del pedido' using errcode = 'P0001';
  end if;
  update public.jobs set video_path = p_path, video_seconds = p_seconds, video_uploaded_at = now()
  where id = p_job returning * into v;
  return v;
end $$;
grant execute on function public.attach_job_video(uuid, text, int) to authenticated;

-- Tarifa de visita: si el pedido es “Visita de diagnóstico presencial”, vale la tarifa de diagnóstico (S/ 20).
create function private.job_visit_fee_cents(p_job uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case when j.diagnostic_visit then private.setting_int('diagnostic_visit_fee_cents', 2000)
              else private.visit_fee_cents(j.trade_id) end
  from public.jobs j where j.id = p_job
$$;
create function public.diagnostic_visit_fee() returns int
language sql stable security definer set search_path = '' as $$
  select private.setting_int('diagnostic_visit_fee_cents', 2000) where (select auth.uid()) is not null
$$;
grant execute on function public.diagnostic_visit_fee() to authenticated;

-- Pedido de diagnóstico: el precio publicado no puede bajar de la tarifa de diagnóstico.
create function private.check_diagnostic_price() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.diagnostic_visit and new.offered_price_cents < private.setting_int('diagnostic_visit_fee_cents', 2000) then
    raise exception 'Una visita de diagnóstico cuesta al menos la tarifa de diagnóstico' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger check_diagnostic_price before insert on public.jobs for each row execute function private.check_diagnostic_price();

-- Cancelar tras la llegada usa la tarifa del pedido (diagnóstico o visita normal).
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
    v_fee := private.job_visit_fee_cents(p_job);
  end if;
  update public.jobs set status = 'cancelled', cancelled_by = auth.uid(), cancel_reason = btrim(p_reason),
    cancelled_at = now(), visit_fee_cents = v_fee
  where id = p_job returning * into v;
  if coalesce(v_fee, 0) > 0 and private.commission_cents(v_fee, coalesce(v.commission_rate_bps, 1000)) > 0 then
    perform private.wallet_post(v_pro, 'commission_debit',
      -private.commission_cents(v_fee, coalesce(v.commission_rate_bps, private.setting_int('commission_rate_bps', 1000))),
      'job:' || p_job || ':visit', p_job, 'tarifa de visita');
  end if;
  return v;
end $$;

create or replace function public.visit_fee_for_trade(p_trade smallint) returns int
language sql stable security definer set search_path = '' as $$
  select private.visit_fee_cents(p_trade) where (select auth.uid()) is not null
$$;
create function public.visit_fee_for_job(p_job uuid) returns int
language sql stable security definer set search_path = '' as $$
  select private.job_visit_fee_cents(p_job)
  where (select auth.uid()) in (private.job_client_id(p_job), private.job_assigned_pro_id(p_job))
$$;
grant execute on function public.visit_fee_for_job(uuid) to authenticated;

-- nearby_jobs: video (con su vencimiento), diagnóstico y aviso discreto de lista negra.
drop function public.nearby_jobs();
create function public.nearby_jobs()
returns table (
  id uuid, trade_id smallint, trade_name text, description text, photos text[],
  offered_price_cents int, distance_m int, created_at timestamptz,
  client_name text, client_rating numeric, my_offer_id uuid, my_offer_status public.offer_status,
  my_offer_price_cents int, pricing_unit public.pricing_unit, units smallint, currency_code char(3),
  video_path text, video_seconds smallint, video_expires_at timestamptz, diagnostic_visit boolean, caution boolean
)
language sql stable security definer set search_path = '' as $$
  select j.id, j.trade_id, t.name, j.description, j.photos, j.offered_price_cents,
    private.round_distance(extensions.st_distance(pp.last_point, j.approx_point)),
    j.created_at, private.short_name(p.full_name), private.rating_avg(j.client_id),
    o.id, o.status, o.price_cents, j.pricing_unit, j.units, j.currency_code,
    case when j.video_uploaded_at > now() - make_interval(hours => private.setting_int('temp_media_hours', 48)) then j.video_path end,
    j.video_seconds,
    j.video_uploaded_at + make_interval(hours => private.setting_int('temp_media_hours', 48)),
    j.diagnostic_visit, private.location_caution(j.approx_point)
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

-- Archivos vencidos de temp_media entran en la limpieza de Storage.
create or replace function public.storage_orphans(p_min_age interval default interval '1 day')
returns table (bucket_id text, name text)
language sql stable security definer set search_path = '' as $$
  select o.bucket_id, o.name from storage.objects o
  where case o.bucket_id
      when 'temp_media' then o.created_at < now() - make_interval(hours => private.setting_int('temp_media_hours', 48))
      else o.created_at < now() - p_min_age and case o.bucket_id
        when 'verification' then not exists (select 1 from public.verification_documents d where d.storage_path = o.name)
        when 'job-photos' then not exists (select 1 from public.jobs j where o.name = any (j.photos))
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

-- ═════════════════════════ Chat 100 % interno con filtro antifraude ═════════════════════════
-- Ninguna de las partes ve el teléfono de la otra: toda la comunicación pasa por el chat.
create or replace function public.job_counterpart_phone(p_job uuid) returns text
language sql stable security definer set search_path = '' as $$
  select null::text where p_job is not null
$$;
create or replace function public.job_counterpart(p_job uuid)
returns table (id uuid, name text, rating numeric, phone text)
language sql stable security definer set search_path = '' as $$
  with j as (select jobs.*, private.job_assigned_pro_id(jobs.id) as pro_id from public.jobs where jobs.id = p_job),
  other as (
    select case when (select auth.uid()) = j.client_id then j.pro_id
                when (select auth.uid()) = j.pro_id then j.client_id end as uid
    from j
  )
  select p.id, private.short_name(p.full_name), private.rating_avg(p.id), null::text
  from other join public.profiles p on p.id = other.uid
$$;

-- Mismo criterio que chatViolation() en packages/shared/src/trust.ts.
create function private.chat_violation(p_body text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v_lower text := lower(p_body);
  v_digits text := regexp_replace(p_body, '[\s.\-()/+]', '', 'g');
begin
  if v_digits ~ '\d{7,}' then
    return 'phone';
  end if;
  if v_lower ~ '[a-z0-9._%+-]+\s*(@|\(at\)|\[at\]| arroba )\s*[a-z0-9.-]+\s*(\.|punto)\s*[a-z]{2,}' then
    return 'email';
  end if;
  if v_lower ~ '(whats\s*app|whatsapp|wasap|wassap|guasap|\mwsp\M|\mwpp\M|\mwa\.me|telegram|\mtelegrama\M|signal|messenger|facebook|instagram|\mig\M:|ll[aá]ma(me)?\s+al|escr[ií]beme\s+al|mi\s+(n[uú]mero|cel|celular|correo|telf?|tel[eé]fono)|p[aá]game\s+(por\s+)?(fuera|aparte|directo)|sin\s+la\s+app|fuera\s+de\s+la\s+app)' then
    return 'keyword';
  end if;
  return null;
end $$;

create table public.chat_flags (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  reason text not null check (reason in ('phone', 'email', 'keyword')),
  created_at timestamptz not null default now()
);
alter table public.chat_flags enable row level security;
grant select on public.chat_flags to authenticated;
create policy "chat_flags: solo soporte" on public.chat_flags for select to authenticated using (public.is_staff());

-- Única forma de escribir en el chat. Si el mensaje trae datos de contacto se bloquea y se registra.
revoke insert on public.job_messages from authenticated;
create function public.send_job_message(p_job uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_reason text;
  v_id bigint;
begin
  if private.job_assigned_pro_id(p_job) is null
     or (select auth.uid()) not in (private.job_client_id(p_job), private.job_assigned_pro_id(p_job)) then
    raise exception 'No participas en este servicio' using errcode = '42501';
  end if;
  if not private.is_active_service(private.job_status(p_job)) then
    raise exception 'El chat se cierra cuando el servicio termina' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 1000 then
    raise exception 'Mensaje vacío o muy largo' using errcode = '22023';
  end if;
  v_reason := private.chat_violation(p_body);
  if v_reason is not null then
    insert into public.chat_flags (job_id, sender_id, reason) values (p_job, auth.uid(), v_reason);
    return jsonb_build_object('blocked', true, 'reason', v_reason);
  end if;
  insert into public.job_messages (job_id, sender_id, body) values (p_job, auth.uid(), btrim(p_body)) returning id into v_id;
  return jsonb_build_object('blocked', false, 'id', v_id);
end $$;
grant execute on function public.send_job_message(uuid, text) to authenticated;

-- ═════════════════════════ Puntos Cerquita (clientes) ═════════════════════════
-- Se ganan al confirmar trabajos en la app; nunca se compran (regla 3). Libro inmutable como wallet_entries.
create table public.points_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  job_id uuid references public.jobs (id),
  type text not null check (type in ('earn', 'redeem', 'reversal')),
  points int not null check (points <> 0),
  balance_after int not null default 0,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  check ((type = 'earn' and points > 0) or (type = 'redeem' and points < 0) or type = 'reversal')
);
create index on public.points_entries (user_id, created_at);
alter table public.points_entries enable row level security;
grant select on public.points_entries to authenticated;
revoke insert, update, delete, truncate on public.points_entries from service_role;
create policy "puntos: los propios o soporte" on public.points_entries for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff());

create function private.points_before_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('points:' || new.user_id::text, 0));
  select coalesce(sum(points), 0) + new.points into new.balance_after from public.points_entries where user_id = new.user_id;
  if new.balance_after < 0 then
    raise exception 'No tienes puntos suficientes' using errcode = 'P0001';
  end if;
  new.created_at := clock_timestamp();
  return new;
end $$;
create trigger points_before_insert before insert on public.points_entries
  for each row execute function private.points_before_insert();
create trigger points_immutable before update or delete on public.points_entries
  for each row execute function private.forbid_change();

create function private.points_post(p_user uuid, p_type text, p_points int, p_key text, p_job uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.points_entries (user_id, job_id, type, points, idempotency_key)
  values (p_user, p_job, p_type, p_points, p_key)
  on conflict (idempotency_key) do nothing;
end $$;

create function public.my_points() returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(points), 0)::int from public.points_entries where user_id = (select auth.uid())
$$;
grant execute on function public.my_points() to authenticated;

alter table public.jobs add column points_redeemed int not null default 0 check (points_redeemed >= 0),
  add column points_discount_cents int not null default 0 check (points_discount_cents >= 0);
grant select (points_redeemed, points_discount_cents) on public.jobs to authenticated;

-- En la pantalla 11 (Terminado), el cliente aplica puntos: descuento ≤ 20 % de la mano de obra.
create function public.apply_points(p_job uuid, p_points int) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare
  v public.jobs;
  v_labor int;
  v_value int := private.setting_int('point_value_cents', 5);
  v_max_cents int;
  v_points int := greatest(0, coalesce(p_points, 0));
begin
  v := private.require_client(p_job);
  perform private.require_status(v, 'finished');
  v_labor := coalesce(v.final_proposed_cents, v.final_price_cents) - v.materials_cents;
  v_max_cents := (v_labor * private.setting_int('max_points_discount_pct', 20)) / 100;
  v_points := least(v_points, public.my_points(), v_max_cents / greatest(v_value, 1));
  update public.jobs set points_redeemed = v_points, points_discount_cents = v_points * v_value
  where id = p_job returning * into v;
  return v;
end $$;
grant execute on function public.apply_points(uuid, int) to authenticated;

-- Al confirmar: canjea los puntos (Cerquita le abona al pro el descuento) y otorga los nuevos.
create function private.settle_points(p_job uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.jobs;
  v_pro uuid;
begin
  select * into v from public.jobs where id = p_job;
  v_pro := private.job_assigned_pro_id(p_job);
  if v.points_redeemed > 0 then
    perform private.points_post(v.client_id, 'redeem', -v.points_redeemed, 'job:' || p_job || ':redeem', p_job);
    perform private.wallet_post(v_pro, 'promo_credit', v.points_discount_cents, 'job:' || p_job || ':points-discount',
      p_job, 'descuento Puntos Cerquita');
  end if;
  if coalesce(v.labor_cents, 0) >= 100 then
    perform private.points_post(v.client_id, 'earn', (v.labor_cents / 100) * private.setting_int('points_per_sol', 1),
      'job:' || p_job || ':earn', p_job);
  end if;
end $$;

create or replace function public.confirm_job(p_job uuid, p_approve boolean default true) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare v public.jobs;
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
  perform private.settle_points(p_job);
  return v;
end $$;

-- ═════════════════════════ Ranking de profesionales ═════════════════════════
-- Puntaje = trabajos confirmados × 10 + calificación promedio × 20 − sospechas de bypass (no descartadas) × 50.
create function private.pro_score(p_pro uuid) returns int
language sql stable security definer set search_path = '' as $$
  select greatest(0, (private.jobs_done(p_pro) * 10
    + coalesce(private.rating_avg(p_pro), 0) * 20
    - (select count(*) from public.bypass_suspicions s where s.pro_id = p_pro and s.status <> 'dismissed') * 50)::int)
$$;

create function public.pro_ranking(p_limit int default 20)
returns table (rank_position int, pro_id uuid, name text, score int, jobs_done int, rating numeric, is_me boolean)
language sql stable security definer set search_path = '' as $$
  with pros as (
    select distinct pt.pro_id from public.pro_trades pt
    join public.profiles p on p.id = pt.pro_id and p.deleted_at is null and p.city_slug = private.active_city()
    where pt.status in ('approved_observation', 'approved_full')
  ), scored as (
    select pro_id, private.pro_score(pro_id) as score from pros
  ), ranked as (
    select (row_number() over (order by s.score desc, s.pro_id))::int as pos, s.pro_id, s.score from scored s
  )
  select r.pos, r.pro_id, private.short_name(p.full_name), r.score, private.jobs_done(r.pro_id),
    private.rating_avg(r.pro_id), r.pro_id = (select auth.uid())
  from ranked r join public.profiles p on p.id = r.pro_id
  where (select auth.uid()) is not null and (r.pos <= least(greatest(p_limit, 1), 100) or r.pro_id = (select auth.uid()))
  order by r.pos
$$;
grant execute on function public.pro_ranking(int) to authenticated;

-- ═════════════════════════ Reclamos con acceso auditado a la identidad ═════════════════════════
-- Términos: Cerquita es intermediario tecnológico; el técnico responde civilmente por su trabajo.
-- En servicios contratados y confirmados en la app, ante un reclamo soporte accede a la identidad
-- verificada del técnico (DNI, antecedentes) con registro de cada vista, y la entrega a quien corresponda.
create table public.claims (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id),
  client_id uuid not null references public.profiles (id),
  pro_id uuid not null references public.profiles (id),
  description text not null check (char_length(description) between 10 and 2000),
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'rejected')),
  resolution text,
  created_at timestamptz not null default now(),
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  unique (job_id, client_id)
);
alter table public.claims enable row level security;
grant select on public.claims to authenticated;
create policy "reclamos: el cliente ve los suyos, soporte todos" on public.claims for select to authenticated
  using (client_id = (select auth.uid()) or public.is_staff());

create function public.file_claim(p_job uuid, p_description text) returns public.claims
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.jobs;
  v public.claims;
begin
  v_job := private.require_client(p_job);
  if v_job.status not in ('confirmed', 'rated', 'finished', 'cancelled') or v_job.accepted_offer_id is null then
    raise exception 'Solo se reclama sobre servicios contratados en la app' using errcode = 'P0001';
  end if;
  insert into public.claims (job_id, client_id, pro_id, description)
  values (p_job, auth.uid(), private.job_assigned_pro_id(p_job), btrim(p_description))
  returning * into v;
  return v;
end $$;
grant execute on function public.file_claim(uuid, text) to authenticated;

create function public.claims_queue()
returns table (id uuid, created_at timestamptz, status text, description text, job_description text,
  client_name text, pro_id uuid, pro_name text, pro_phone text, identity_docs jsonb)
language sql stable security definer set search_path = '' as $$
  select c.id, c.created_at, c.status, c.description, j.description, cp.full_name, c.pro_id, pp.full_name, pp.phone,
    coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind) order by d.kind)
              from public.verification_documents d where d.pro_id = c.pro_id and d.pro_trade_id is null), '[]')
  from public.claims c
  join public.jobs j on j.id = c.job_id
  join public.profiles cp on cp.id = c.client_id
  join public.profiles pp on pp.id = c.pro_id
  where public.is_staff()
  order by c.status = 'open' desc, c.created_at desc
$$;
grant execute on function public.claims_queue() to authenticated;

create function public.resolve_claim(p_claim uuid, p_status text, p_resolution text) returns public.claims
language plpgsql security definer set search_path = '' as $$
declare v public.claims;
begin
  if not public.is_staff() then
    raise exception 'Solo soporte resuelve reclamos' using errcode = '42501';
  end if;
  if p_status not in ('in_review', 'resolved', 'rejected') or nullif(btrim(p_resolution), '') is null then
    raise exception 'Estado o resolución inválidos' using errcode = '22023';
  end if;
  update public.claims set status = p_status, resolution = btrim(p_resolution), resolved_by = auth.uid(),
    resolved_at = case when p_status in ('resolved', 'rejected') then now() end
  where id = p_claim returning * into v;
  if not found then
    raise exception 'Reclamo no encontrado' using errcode = 'P0002';
  end if;
  return v;
end $$;
grant execute on function public.resolve_claim(uuid, text, text) to authenticated;
