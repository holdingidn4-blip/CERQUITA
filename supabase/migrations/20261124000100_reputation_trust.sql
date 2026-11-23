-- F4 · Reputación y confianza: calificación visible desde un mínimo, niveles del profesional,
-- libro inmutable de puntos del profesional, lista negra de personas (motivo, plazo, DNI y dispositivo)
-- con apelación humana, y primer trabajo supervisado con muestreo en oficios de riesgo.

insert into public.settings (key, scope, value) values
  ('rating_min_visible', 'global', '3'),
  ('level_verified_jobs', 'global', '3'),
  ('level_trusted_jobs', 'global', '15'),
  ('level_featured_jobs', 'global', '40'),
  ('level_featured_min_rating_x10', 'global', '45'),
  ('level_points_per_job', 'global', '50'),
  ('supervision_sample_pct', 'global', '20')
on conflict (key, scope) do nothing;

-- ═════════════ Calificación: el promedio se muestra desde un mínimo ═════════════
create function private.rating_avg_raw(p_user uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select round(avg(stars)::numeric, 1) from public.ratings where to_id = p_user
$$;

-- Todas las pantallas leen private.rating_avg: con menos de `rating_min_visible` calificaciones no se muestra.
create or replace function private.rating_avg(p_user uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select case when count(*) >= private.setting_int('rating_min_visible', 3) then round(avg(stars)::numeric, 1) end
  from public.ratings where to_id = p_user
$$;

-- ═════════════ Puntos del profesional (capacitaciones): libro inmutable ═════════════
create table public.pro_points_entries (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('training', 'adjustment', 'reversal')),
  points int not null check (points <> 0),
  idempotency_key text not null unique,
  reason text check (char_length(reason) <= 300),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.pro_points_entries (pro_id, created_at desc);
create index on public.pro_points_entries (created_by);
alter table public.pro_points_entries enable row level security;
grant select on public.pro_points_entries to authenticated;
create policy "puntos del pro: el propio o soporte" on public.pro_points_entries for select to authenticated
  using (pro_id = (select auth.uid()) or public.is_staff());

create function private.pro_points(p_pro uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(points), 0)::int from public.pro_points_entries where pro_id = p_pro
$$;

-- Inserta un asiento de puntos una sola vez por clave (las correcciones van con 'reversal').
create function private.pro_points_post(p_pro uuid, p_kind text, p_points int, p_key text, p_reason text)
returns void language sql security definer set search_path = '' as $$
  insert into public.pro_points_entries (pro_id, kind, points, idempotency_key, reason, created_by)
  values (p_pro, p_kind, p_points, p_key, p_reason, auth.uid())
  on conflict (idempotency_key) do nothing
$$;

-- ═════════════ Niveles: nuevo, verificado, de confianza, destacado ═════════════
-- Quejas confirmadas: reclamos resueltos a favor del cliente y reportes con acción.
create function private.confirmed_complaints(p_pro uuid) returns int
language sql stable security definer set search_path = '' as $$
  select ((select count(*) from public.claims where pro_id = p_pro and status = 'resolved')
        + (select count(*) from public.user_reports where reported_id = p_pro and status = 'actioned'))::int
$$;

-- Avance = trabajos confirmados + puntos de capacitación convertidos (level_points_per_job puntos = 1 trabajo).
create function private.pro_progress(p_pro uuid) returns int
language sql stable security definer set search_path = '' as $$
  select private.jobs_done(p_pro) + private.pro_points(p_pro) / greatest(private.setting_int('level_points_per_job', 50), 1)
$$;

create function private.pro_level(p_pro uuid) returns text
language sql stable security definer set search_path = '' as $$
  with m as (
    select private.pro_progress(p_pro) as progress, private.confirmed_complaints(p_pro) as complaints,
      coalesce(private.rating_avg_raw(p_pro), 0) as rating
  )
  select case
    when progress >= private.setting_int('level_featured_jobs', 40) and complaints = 0
      and rating * 10 >= private.setting_int('level_featured_min_rating_x10', 45) then 'destacado'
    when progress >= private.setting_int('level_trusted_jobs', 15) and complaints = 0 then 'confianza'
    when progress >= private.setting_int('level_verified_jobs', 3) then 'verificado'
    else 'nuevo'
  end from m
$$;

create function private.level_rank(p_level text) returns int
language sql immutable set search_path = '' as $$
  select case p_level when 'destacado' then 3 when 'confianza' then 2 when 'verificado' then 1 else 0 end
$$;

-- El ranking suma los puntos de capacitación y usa la calificación completa (aunque aún no se muestre).
create or replace function private.pro_score(p_pro uuid) returns int
language sql stable security definer set search_path = '' as $$
  select greatest(0, (private.jobs_done(p_pro) * 10
    + coalesce(private.rating_avg_raw(p_pro), 0) * 20
    + private.pro_points(p_pro)
    - (select count(*) from public.bypass_suspicions s where s.pro_id = p_pro and s.status <> 'dismissed') * 50)::int)
$$;

-- Resumen para el propio profesional.
create function public.my_reputation()
returns table (level text, progress int, next_level text, next_at int, points int, complaints int,
  ratings_count int, rating_avg numeric, rating_visible_from int)
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as id),
  m as (
    select private.pro_level(me.id) as level, private.pro_progress(me.id) as progress,
      private.pro_points(me.id) as points, private.confirmed_complaints(me.id) as complaints,
      (select count(*)::int from public.ratings r where r.to_id = me.id) as ratings_count,
      private.rating_avg(me.id) as rating_avg
    from me where me.id is not null
  )
  select m.level, m.progress,
    case m.level when 'nuevo' then 'verificado' when 'verificado' then 'confianza' when 'confianza' then 'destacado' end,
    case m.level when 'nuevo' then private.setting_int('level_verified_jobs', 3)
      when 'verificado' then private.setting_int('level_trusted_jobs', 15)
      when 'confianza' then private.setting_int('level_featured_jobs', 40) end,
    m.points, m.complaints, m.ratings_count, m.rating_avg, private.setting_int('rating_min_visible', 3)
  from m
$$;
revoke execute on function public.my_reputation() from public, anon;
grant execute on function public.my_reputation() to authenticated;

-- Ofertas: muestran el nivel y los niveles altos aparecen primero (prioridad).
drop function public.job_offers(uuid);
create function public.job_offers(p_job uuid)
returns table (
  id uuid, pro_id uuid, price_cents int, message text, status public.offer_status, created_at timestamptz,
  pro_name text, avatar_url text, rating_avg numeric, jobs_done int, distance_m int, eta_minutes smallint,
  visit_cents int, labor_cents int, materials_cents int, transport_cents int, level text
)
language sql stable security definer set search_path = '' as $$
  select o.id, o.pro_id, o.price_cents, o.message, o.status, o.created_at,
    private.short_name(p.full_name), p.avatar_url, private.rating_avg(o.pro_id), private.jobs_done(o.pro_id),
    case when pp.last_point is not null
      then private.round_distance(extensions.st_distance(pp.last_point, j.approx_point)) end,
    o.eta_minutes, o.visit_cents, o.labor_cents, o.materials_cents, o.transport_cents, private.pro_level(o.pro_id)
  from public.offers o
  join public.jobs j on j.id = o.job_id
  join public.profiles p on p.id = o.pro_id
  left join public.pro_presence pp on pp.pro_id = o.pro_id
  where o.job_id = p_job and j.client_id = (select auth.uid()) and o.status in ('pending', 'accepted')
  order by private.level_rank(private.pro_level(o.pro_id)) desc, o.price_cents, o.created_at
$$;
revoke execute on function public.job_offers(uuid) from public, anon;
grant execute on function public.job_offers(uuid) to authenticated;

drop function public.pro_profile(uuid);
create function public.pro_profile(p_pro uuid)
returns table (
  id uuid, full_name text, avatar_url text, trades text[], identity_verified boolean,
  rating_avg numeric, ratings_count int, jobs_done int,
  review_stars smallint, review_comment text, review_author text, level text
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.avatar_url,
    array(
      select t.pro_name from public.pro_trades pt join public.trades t on t.id = pt.trade_id
      where pt.pro_id = p.id and pt.status in ('approved_observation', 'approved_full') order by t.id
    ),
    true,
    private.rating_avg(p.id),
    (select count(*)::int from public.ratings where to_id = p.id),
    private.jobs_done(p.id),
    r.stars, r.comment, private.short_name(rp.full_name), private.pro_level(p.id)
  from public.profiles p
  left join lateral (
    select * from public.ratings where to_id = p.id and comment is not null order by created_at desc limit 1
  ) r on true
  left join public.profiles rp on rp.id = r.from_id
  where p.id = p_pro and p.deleted_at is null and (select auth.uid()) is not null
    and exists (
      select 1 from public.pro_trades pt
      where pt.pro_id = p.id and pt.status in ('approved_observation', 'approved_full')
    )
$$;
revoke execute on function public.pro_profile(uuid) from public, anon;
grant execute on function public.pro_profile(uuid) to authenticated;

-- ═════════════ Dispositivos (para la lista negra) ═════════════
-- Solo se guarda el hash del identificador del dispositivo, nunca el valor.
create table public.user_devices (
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, device_hash)
);
create index on public.user_devices (device_hash);
alter table public.user_devices enable row level security;
grant select on public.user_devices to authenticated;
create policy "dispositivos: solo soporte" on public.user_devices for select to authenticated
  using (public.is_staff());

create function public.register_device(p_device text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Inicia sesión' using errcode = '42501';
  end if;
  if p_device is null or char_length(p_device) not between 8 and 200 then
    raise exception 'Identificador de dispositivo inválido' using errcode = '22023';
  end if;
  insert into public.user_devices (user_id, device_hash)
  values (v_uid, encode(sha256(convert_to(p_device, 'UTF8')), 'hex'))
  on conflict (user_id, device_hash) do update set last_seen_at = now();
end $$;
revoke execute on function public.register_device(text) from public, anon;
grant execute on function public.register_device(text) to authenticated;

-- ═════════════ Lista negra de personas ═════════════
create table public.blacklist_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  dni_number text check (dni_number ~ '^[0-9]{8}$'),
  device_hashes text[] not null default '{}',
  reason text not null check (char_length(reason) between 5 and 500),
  until timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid references public.profiles (id),
  lift_note text check (char_length(lift_note) <= 500),
  appeal_text text check (char_length(appeal_text) <= 1000),
  appealed_at timestamptz,
  appeal_status text check (appeal_status in ('pending', 'accepted', 'rejected')),
  appeal_note text check (char_length(appeal_note) <= 500),
  appeal_reviewed_by uuid references public.profiles (id),
  appeal_reviewed_at timestamptz,
  check (profile_id is not null or dni_number is not null or cardinality(device_hashes) > 0)
);
create index on public.blacklist_entries (profile_id);
create index on public.blacklist_entries (dni_number);
create index on public.blacklist_entries using gin (device_hashes);
create index on public.blacklist_entries (created_by);
create index on public.blacklist_entries (lifted_by);
create index on public.blacklist_entries (appeal_reviewed_by);
alter table public.blacklist_entries enable row level security;
grant select on public.blacklist_entries to authenticated;
create policy "lista negra: solo soporte" on public.blacklist_entries for select to authenticated
  using (public.is_staff());

create function private.entry_active(b public.blacklist_entries) returns boolean
language sql stable set search_path = '' as $$
  select b.lifted_at is null and (b.until is null or b.until > now()) and b.appeal_status is distinct from 'accepted'
$$;

-- Entrada vigente que alcanza a la persona: por perfil, por su DNI o por uno de sus dispositivos.
create function private.active_blacklist_entry(p_user uuid) returns public.blacklist_entries
language sql stable security definer set search_path = '' as $$
  select b.* from public.blacklist_entries b
  where private.entry_active(b)
    and (b.profile_id = p_user
      or b.dni_number = (select i.dni_number from public.pro_identity i where i.pro_id = p_user)
      or b.device_hashes && array(select d.device_hash from public.user_devices d where d.user_id = p_user))
  order by b.created_at desc
  limit 1
$$;

create function private.is_blacklisted(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (private.active_blacklist_entry(p_user)).id is not null
$$;

create function private.guard_blacklist() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  -- Cada rama lee solo la columna que existe en su tabla (PL/pgSQL resuelve los campos al ejecutar).
  if tg_table_name = 'jobs' then
    v_user := new.client_id;
  else
    v_user := new.pro_id;
  end if;
  if tg_table_name = 'pro_identity' then
    if exists (
      select 1 from public.blacklist_entries b where private.entry_active(b) and b.dni_number = new.dni_number
    ) then
      raise exception 'Este DNI tiene una restricción en Cerquita. Escríbenos desde Ayuda si crees que es un error.'
        using errcode = '42501';
    end if;
  end if;
  if private.is_blacklisted(v_user) then
    raise exception 'Tu cuenta tiene una restricción. Revisa Ajustes → Restricción para ver el motivo y apelar.'
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_blacklist before insert on public.jobs
  for each row execute function private.guard_blacklist();
create trigger guard_blacklist before insert on public.offers
  for each row execute function private.guard_blacklist();
create trigger guard_blacklist before insert or update of dni_number on public.pro_identity
  for each row execute function private.guard_blacklist();
create trigger guard_blacklist before update of status on public.pro_trades
  for each row when (new.status = 'submitted' and old.status is distinct from 'submitted')
  execute function private.guard_blacklist();

create function private.is_support() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'staff_role', '') in ('support', 'admin')
$$;

-- Soporte agrega a una persona: guarda su DNI (si es profesional) y sus dispositivos conocidos.
create function public.admin_blacklist_person(p_profile uuid, p_reason text, p_days int)
returns public.blacklist_entries
language plpgsql security definer set search_path = '' as $$
declare
  v public.blacklist_entries;
begin
  if not private.is_support() then
    raise exception 'Solo soporte agrega a la lista negra' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'Escribe el motivo (mínimo 5 caracteres)' using errcode = '22023';
  end if;
  if p_days is not null and p_days not between 1 and 3650 then
    raise exception 'El plazo va de 1 a 3650 días (vacío = indefinido)' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile) then
    raise exception 'Usuario no encontrado' using errcode = 'P0002';
  end if;
  if private.is_blacklisted(p_profile) then
    raise exception 'Esta persona ya tiene una restricción vigente' using errcode = 'P0001';
  end if;
  insert into public.blacklist_entries (profile_id, dni_number, device_hashes, reason, until, created_by)
  values (
    p_profile,
    (select dni_number from public.pro_identity where pro_id = p_profile),
    array(select device_hash from public.user_devices where user_id = p_profile order by device_hash),
    btrim(p_reason),
    case when p_days is not null then now() + make_interval(days => p_days) end,
    auth.uid()
  ) returning * into v;
  insert into public.admin_actions (actor_id, action, target_user, target_entry, note)
  values (auth.uid(), 'blacklist_add', p_profile, v.id, btrim(p_reason));
  return v;
end $$;
revoke execute on function public.admin_blacklist_person(uuid, text, int) from public, anon;
grant execute on function public.admin_blacklist_person(uuid, text, int) to authenticated;

create function public.admin_lift_blacklist(p_entry uuid, p_note text) returns public.blacklist_entries
language plpgsql security definer set search_path = '' as $$
declare
  v public.blacklist_entries;
begin
  if not private.is_support() then
    raise exception 'Solo soporte levanta restricciones' using errcode = '42501';
  end if;
  if nullif(btrim(p_note), '') is null then
    raise exception 'Escribe el motivo' using errcode = '22023';
  end if;
  update public.blacklist_entries set lifted_at = now(), lifted_by = auth.uid(), lift_note = btrim(p_note)
  where id = p_entry and lifted_at is null returning * into v;
  if not found then
    raise exception 'Restricción no encontrada o ya levantada' using errcode = 'P0002';
  end if;
  insert into public.admin_actions (actor_id, action, target_user, target_entry, note)
  values (auth.uid(), 'blacklist_lift', v.profile_id, v.id, btrim(p_note));
  return v;
end $$;
revoke execute on function public.admin_lift_blacklist(uuid, text) from public, anon;
grant execute on function public.admin_lift_blacklist(uuid, text) to authenticated;

-- La persona ve su restricción (sin DNI ni dispositivos) y puede apelarla una vez.
create function public.my_restriction()
returns table (id uuid, reason text, until timestamptz, created_at timestamptz,
  appeal_status text, appeal_note text, appealed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.id, b.reason, b.until, b.created_at, b.appeal_status, b.appeal_note, b.appealed_at
  from private.active_blacklist_entry((select auth.uid())) b
  where b.id is not null
  union all
  -- Apelación rechazada o aceptada recientemente: se muestra la respuesta.
  select b.id, b.reason, b.until, b.created_at, b.appeal_status, b.appeal_note, b.appealed_at
  from public.blacklist_entries b
  where b.profile_id = (select auth.uid()) and b.appeal_status = 'accepted'
    and b.appeal_reviewed_at > now() - interval '30 days'
$$;
revoke execute on function public.my_restriction() from public, anon;
grant execute on function public.my_restriction() to authenticated;

create function public.appeal_blacklist(p_entry uuid, p_text text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_text text := btrim(coalesce(p_text, ''));
begin
  if char_length(v_text) not between 10 and 1000 then
    raise exception 'Cuéntanos qué pasó (de 10 a 1000 caracteres)' using errcode = '22023';
  end if;
  if (private.active_blacklist_entry(auth.uid())).id is distinct from p_entry then
    raise exception 'No tienes esa restricción vigente' using errcode = '42501';
  end if;
  update public.blacklist_entries set appeal_text = v_text, appealed_at = now(), appeal_status = 'pending'
  where id = p_entry and appeal_status is null;
  if not found then
    raise exception 'Ya apelaste esta restricción' using errcode = 'P0001';
  end if;
end $$;
revoke execute on function public.appeal_blacklist(uuid, text) from public, anon;
grant execute on function public.appeal_blacklist(uuid, text) to authenticated;

-- La apelación la decide una persona del equipo de soporte, con nota.
create function public.review_blacklist_appeal(p_entry uuid, p_accept boolean, p_note text)
returns public.blacklist_entries
language plpgsql security definer set search_path = '' as $$
declare
  v public.blacklist_entries;
begin
  if not private.is_support() then
    raise exception 'Solo soporte resuelve apelaciones' using errcode = '42501';
  end if;
  if nullif(btrim(p_note), '') is null then
    raise exception 'Escribe el motivo de la decisión' using errcode = '22023';
  end if;
  update public.blacklist_entries
  set appeal_status = case when p_accept then 'accepted' else 'rejected' end,
    appeal_note = btrim(p_note), appeal_reviewed_by = auth.uid(), appeal_reviewed_at = now()
  where id = p_entry and appeal_status = 'pending' returning * into v;
  if not found then
    raise exception 'Apelación no encontrada o ya resuelta' using errcode = 'P0002';
  end if;
  insert into public.admin_actions (actor_id, action, target_user, target_entry, note)
  values (auth.uid(), case when p_accept then 'blacklist_appeal_accepted' else 'blacklist_appeal_rejected' end,
    v.profile_id, v.id, btrim(p_note));
  return v;
end $$;
revoke execute on function public.review_blacklist_appeal(uuid, boolean, text) from public, anon;
grant execute on function public.review_blacklist_appeal(uuid, boolean, text) to authenticated;

-- ═════════════ Primer trabajo supervisado y muestreo en oficios de riesgo ═════════════
create table public.job_supervisions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  pro_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('first_job', 'risk_sample')),
  status text not null default 'pending' check (status in ('pending', 'ok', 'issues', 'cancelled')),
  arrival_ok boolean,
  treatment_ok boolean,
  scope_ok boolean,
  safety_ok boolean,
  note text check (char_length(note) <= 1000),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (job_id, pro_id)
);
create index on public.job_supervisions (pro_id);
create index on public.job_supervisions (status, created_at);
create index on public.job_supervisions (reviewed_by);
alter table public.job_supervisions enable row level security;
grant select on public.job_supervisions to authenticated;
create policy "supervisión: el profesional ve la suya, soporte todas" on public.job_supervisions for select to authenticated
  using (pro_id = (select auth.uid()) or public.is_staff());

create function private.on_job_supervision() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_pro uuid;
  v_risk text;
begin
  if new.status in ('cancelled', 'published', 'with_offers') then
    update public.job_supervisions set status = 'cancelled' where job_id = new.id and status = 'pending';
    return null;
  end if;
  if new.status <> 'accepted' or new.accepted_offer_id is null then
    return null;
  end if;
  select pro_id into v_pro from public.offers where id = new.accepted_offer_id;
  select risk_level into v_risk from public.trades where id = new.trade_id;
  if not exists (
    select 1 from public.job_supervisions where pro_id = v_pro and reason = 'first_job' and status <> 'cancelled'
  ) and private.jobs_done(v_pro) = 0 then
    insert into public.job_supervisions (job_id, pro_id, reason) values (new.id, v_pro, 'first_job')
    on conflict (job_id, pro_id) do nothing;
  elsif v_risk = 'high' and random() * 100 < private.setting_int('supervision_sample_pct', 20) then
    insert into public.job_supervisions (job_id, pro_id, reason) values (new.id, v_pro, 'risk_sample')
    on conflict (job_id, pro_id) do nothing;
  end if;
  return null;
end $$;
create trigger on_job_supervision after update of status on public.jobs
  for each row when (new.status is distinct from old.status)
  execute function private.on_job_supervision();

-- Soporte completa el checklist (llegada, trato, alcance, seguridad) cuando el trabajo terminó.
create function public.review_supervision(p_supervision uuid, p_arrival boolean, p_treatment boolean,
  p_scope boolean, p_safety boolean, p_note text) returns public.job_supervisions
language plpgsql security definer set search_path = '' as $$
declare
  v public.job_supervisions;
  v_status public.job_status;
begin
  if not private.is_support() then
    raise exception 'Solo soporte completa la supervisión' using errcode = '42501';
  end if;
  if p_arrival is null or p_treatment is null or p_scope is null or p_safety is null then
    raise exception 'Marca los cuatro puntos del checklist' using errcode = '22023';
  end if;
  select * into v from public.job_supervisions where id = p_supervision for update;
  if not found or v.status <> 'pending' then
    raise exception 'Supervisión no encontrada o ya revisada' using errcode = 'P0002';
  end if;
  select status into v_status from public.jobs where id = v.job_id;
  if v_status not in ('finished', 'confirmed', 'rated') then
    raise exception 'El trabajo aún no termina' using errcode = 'P0001';
  end if;
  if not (p_arrival and p_treatment and p_scope and p_safety) and nullif(btrim(p_note), '') is null then
    raise exception 'Describe qué falló' using errcode = '22023';
  end if;
  update public.job_supervisions set
    arrival_ok = p_arrival, treatment_ok = p_treatment, scope_ok = p_scope, safety_ok = p_safety,
    note = nullif(btrim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now(),
    status = case when p_arrival and p_treatment and p_scope and p_safety then 'ok' else 'issues' end
  where id = p_supervision returning * into v;
  return v;
end $$;
revoke execute on function public.review_supervision(uuid, boolean, boolean, boolean, boolean, text) from public, anon;
grant execute on function public.review_supervision(uuid, boolean, boolean, boolean, boolean, text) to authenticated;
