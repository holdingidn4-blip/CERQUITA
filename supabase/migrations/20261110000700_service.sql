-- Fase 6 · Servicio en curso: estados, código de seguridad, ubicación en vivo, chat y confirmación.
-- Toda transición pasa por funciones que validan quién la pide y en qué estado está el pedido.

alter table public.jobs
  add column security_code text check (security_code ~ '^\d{4}$'),
  add column final_proposed_cents int check (final_proposed_cents > 0),
  add column started_at timestamptz,
  add column arrived_at timestamptz,
  add column finished_at timestamptz,
  add column confirmed_at timestamptz,
  add column cancelled_by uuid references public.profiles (id),
  add column cancel_reason text check (char_length(cancel_reason) <= 300);

-- El código no se concede en SELECT: el cliente lo lee con job_security_code(); el pro nunca.
grant select (final_proposed_cents, started_at, arrived_at, finished_at, confirmed_at, cancelled_by, cancel_reason)
  on public.jobs to authenticated;

create function private.require_assigned_pro(p_job uuid) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare v public.jobs;
begin
  select * into v from public.jobs where id = p_job for update;
  if not found or private.job_assigned_pro_id(p_job) is distinct from (select auth.uid()) then
    raise exception 'Solo el profesional asignado puede hacer esto' using errcode = '42501';
  end if;
  return v;
end $$;

create function private.require_client(p_job uuid) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare v public.jobs;
begin
  select * into v from public.jobs where id = p_job for update;
  if not found or v.client_id <> (select auth.uid()) then
    raise exception 'Solo quien hizo el pedido puede hacer esto' using errcode = '42501';
  end if;
  return v;
end $$;

create function private.require_status(v public.jobs, variadic p_allowed public.job_status[]) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if not (v.status = any (p_allowed)) then
    raise exception 'El servicio está en "%", no se puede hacer esto ahora', v.status using errcode = 'P0001';
  end if;
end $$;

-- “Ir al domicilio”: empieza a compartir ubicación y se genera el código de 4 dígitos.
create function public.start_trip(p_job uuid) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare v public.jobs;
begin
  v := private.require_assigned_pro(p_job);
  perform private.require_status(v, 'accepted');
  update public.jobs set status = 'on_the_way', started_at = now(),
    security_code = lpad((floor(random() * 10000))::int::text, 4, '0')
  where id = p_job returning * into v;
  return v;
end $$;

-- “Llegué”: el cliente le dicta el código al profesional.
create function public.arrive(p_job uuid, p_code text) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare v public.jobs;
begin
  v := private.require_assigned_pro(p_job);
  perform private.require_status(v, 'on_the_way');
  if v.security_code is distinct from btrim(p_code) then
    raise exception 'El código no coincide. Pídeselo al cliente.' using errcode = '22023';
  end if;
  update public.jobs set status = 'at_home', arrived_at = now() where id = p_job returning * into v;
  return v;
end $$;

-- “Terminado”: el pro marca el monto final (por defecto el acordado). El GPS se corta.
create function public.finish_job(p_job uuid, p_final_cents int default null) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare v public.jobs;
begin
  v := private.require_assigned_pro(p_job);
  perform private.require_status(v, 'at_home');
  if p_final_cents is not null and (p_final_cents <= 0 or p_final_cents > 500000) then
    raise exception 'Monto final inválido' using errcode = '22023';
  end if;
  update public.jobs set status = 'finished', finished_at = now(),
    final_proposed_cents = coalesce(p_final_cents, v.final_price_cents)
  where id = p_job returning * into v;
  return v;
end $$;

-- Pantalla 11: el cliente aprueba el monto (queda Confirmado) o lo rechaza (vuelve al domicilio).
-- La fase 7 agrega aquí el asiento de comisión.
create function public.confirm_job(p_job uuid, p_approve boolean default true) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare v public.jobs;
begin
  v := private.require_client(p_job);
  if v.status = 'confirmed' and p_approve then
    return v; -- idempotente: una segunda confirmación no hace nada
  end if;
  perform private.require_status(v, 'finished');
  if not p_approve then
    update public.jobs set status = 'at_home', final_proposed_cents = null, finished_at = null
    where id = p_job returning * into v;
    return v;
  end if;
  update public.jobs set status = 'confirmed', confirmed_at = now(), final_price_cents = v.final_proposed_cents
  where id = p_job returning * into v;
  return v;
end $$;

-- Cancelar un servicio aceptado (antes de Terminado). Cualquiera de los dos; el GPS se corta.
create function public.cancel_service(p_job uuid, p_reason text) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare v public.jobs;
begin
  select * into v from public.jobs where id = p_job for update;
  if not found or (select auth.uid()) not in (v.client_id, coalesce(private.job_assigned_pro_id(p_job), v.client_id)) then
    raise exception 'No participas en este servicio' using errcode = '42501';
  end if;
  perform private.require_status(v, 'published', 'with_offers', 'accepted', 'on_the_way', 'at_home');
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Cuéntanos el motivo de la cancelación' using errcode = '22023';
  end if;
  update public.jobs set status = 'cancelled', cancelled_by = auth.uid(), cancel_reason = btrim(p_reason)
  where id = p_job returning * into v;
  return v;
end $$;

create function public.job_security_code(p_job uuid) returns text
language sql stable security definer set search_path = '' as $$
  select security_code from public.jobs
  where id = p_job and client_id = (select auth.uid()) and status = 'on_the_way'
$$;

-- Última posición del pro, solo para el cliente y solo entre “Ir al domicilio” y “Terminado” (regla 5).
create function public.job_live_location(p_job uuid)
returns table (latitude float8, longitude float8, recorded_at timestamptz, distance_m int)
language sql stable security definer set search_path = '' as $$
  select extensions.st_y(t.point::extensions.geometry), extensions.st_x(t.point::extensions.geometry), t.recorded_at,
    private.round_distance(extensions.st_distance(t.point, j.approx_point))
  from public.jobs j
  join lateral (select * from public.job_tracks where job_id = j.id order by recorded_at desc limit 1) t on true
  where j.id = p_job and j.status in ('on_the_way', 'at_home')
    and (j.client_id = (select auth.uid()) or public.is_staff())
$$;

grant execute on function public.start_trip(uuid), public.arrive(uuid, text), public.finish_job(uuid, int),
  public.confirm_job(uuid, boolean), public.cancel_service(uuid, text), public.job_security_code(uuid),
  public.job_live_location(uuid) to authenticated;

-- El cliente ya no cancela con UPDATE directo: usa cancel_service() (queda el motivo).
revoke update on public.jobs from authenticated;
grant update (description, photos, offered_price_cents) on public.jobs to authenticated;
create or replace function private.guard_job() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.approx_point := extensions.st_setsrid(extensions.st_makepoint(
      round(extensions.st_x(new.approx_point::extensions.geometry)::numeric, 3)::float8,
      round(extensions.st_y(new.approx_point::extensions.geometry)::numeric, 3)::float8
    ), 4326)::extensions.geography;
    if private.is_api_user() then
      new.status := 'published';
      new.accepted_offer_id := null;
      new.final_price_cents := null;
      new.commission_rate_bps := null;
      new.security_code := null;
    end if;
  end if;
  return new;
end $$;

-- ───────────────────────── Chat del servicio ─────────────────────────
create table public.job_messages (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs (id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles (id),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index on public.job_messages (job_id, created_at);
alter table public.job_messages enable row level security;
grant select, insert (job_id, body) on public.job_messages to authenticated;
create policy "chat: leer participantes" on public.job_messages for select to authenticated
  using ((select auth.uid()) in (private.job_client_id(job_id), private.job_assigned_pro_id(job_id)) or public.is_staff());
create policy "chat: escribir con el servicio activo" on public.job_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select auth.uid()) in (private.job_client_id(job_id), private.job_assigned_pro_id(job_id))
    and private.job_status(job_id) in ('accepted', 'on_the_way', 'at_home', 'finished')
  );

-- ───────────────────────── Realtime ─────────────────────────
-- postgres_changes respeta la RLS de filas pero NO los permisos por columna: por eso `jobs`
-- (dirección exacta, código de seguridad) no se publica. Su estado se consulta con funciones.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.job_messages, public.job_tracks, public.offers;
  end if;
end $$;

-- Datos de la otra parte del servicio: nombre corto, calificación y teléfono (este, solo con el servicio activo).
create function public.job_counterpart(p_job uuid)
returns table (id uuid, name text, rating numeric, phone text)
language sql stable security definer set search_path = '' as $$
  with j as (
    select jobs.*, private.job_assigned_pro_id(jobs.id) as pro_id from public.jobs where jobs.id = p_job
  ), other as (
    select case when (select auth.uid()) = j.client_id then j.pro_id
                when (select auth.uid()) = j.pro_id then j.client_id end as uid, j.status
    from j
  )
  select p.id, private.short_name(p.full_name), private.rating_avg(p.id),
    case when other.status in ('accepted', 'on_the_way', 'at_home', 'finished') then p.phone end
  from other join public.profiles p on p.id = other.uid
$$;
grant execute on function public.job_counterpart(uuid) to authenticated;
