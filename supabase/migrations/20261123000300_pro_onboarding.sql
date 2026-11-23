-- F2 · Registro del profesional paso a paso.
-- · Nivel de riesgo por oficio y subespecialidades (catálogo cerrado).
-- · Datos del DNI con validación de mayor de 18 años (un DNI por cuenta).
-- · Requisitos según el riesgo: alto = fotos + certificado técnico; confianza = 2 referencias;
--   habilidad = 3 a 5 fotos con descripción. Todos: identidad, antecedentes penales, al menos una
--   subespecialidad y un video de verificación de 1 a 3 minutos grabado en la app.
-- · Antecedentes: se guarda solo el resultado por oficio (apto / con restricción / no apto); el
--   certificado se borra al decidir (el archivo lo retira la limpieza de Storage).
-- · Historial de cada cambio de estado con responsable y motivo; cola por riesgo y antigüedad.

insert into public.settings (key, scope, value) values
  ('skill_min_photos', 'global', '3'),
  ('skill_max_photos', 'global', '5'),
  ('verification_video_min_seconds', 'global', '60'),
  ('verification_video_max_seconds', 'global', '180'),
  ('review_alert_hours', 'global', '24'),
  ('background_valid_days', 'global', '365')
on conflict (key, scope) do nothing;

-- ═════════════ Riesgo y subespecialidades ═════════════
alter table public.trades add column risk_level text not null default 'skill'
  check (risk_level in ('high', 'trust', 'skill'));
update public.trades set risk_level = case slug
  when 'gasfiteria' then 'high' when 'electricidad' then 'high' when 'hogar' then 'high'
  when 'limpieza' then 'trust' when 'cuidado' then 'trust' when 'chofer' then 'trust'
  else 'skill' end;

create table public.trade_specialties (
  id smallint generated always as identity primary key,
  trade_id smallint not null references public.trades (id),
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 2 and 60),
  active boolean not null default true,
  unique (trade_id, slug)
);
alter table public.trade_specialties enable row level security;
grant select on public.trade_specialties to anon, authenticated;
create policy "subespecialidades: lectura" on public.trade_specialties for select to anon, authenticated
  using (true);

insert into public.trade_specialties (trade_id, slug, name)
select t.id, v.slug, v.name
from public.trades t
join (values
  ('gasfiteria', 'agua-desague', 'Agua y desagüe'),
  ('gasfiteria', 'gas', 'Instalación de gas'),
  ('gasfiteria', 'termas', 'Termas y calentadores'),
  ('electricidad', 'instalaciones', 'Instalaciones eléctricas'),
  ('electricidad', 'tableros', 'Tableros y llaves'),
  ('electricidad', 'camaras', 'Cámaras con cableado'),
  ('electricidad', 'iluminacion', 'Iluminación'),
  ('hogar', 'electrodomesticos', 'Electrodomésticos'),
  ('hogar', 'cerrajeria', 'Cerrajería'),
  ('hogar', 'instalaciones-varias', 'Instalaciones varias (TV, repisas)'),
  ('carpinteria', 'muebles', 'Muebles a medida'),
  ('carpinteria', 'puertas-ventanas', 'Puertas y ventanas'),
  ('carpinteria', 'reparaciones', 'Reparaciones de madera'),
  ('pintura', 'interiores', 'Interiores'),
  ('pintura', 'exteriores', 'Fachadas y exteriores'),
  ('pintura', 'acabados', 'Empastado y acabados'),
  ('albanileria', 'muros', 'Muros y tarrajeo'),
  ('albanileria', 'enchapes', 'Pisos y enchapes'),
  ('albanileria', 'techos', 'Techos y losas'),
  ('limpieza', 'casa', 'Limpieza de casa'),
  ('limpieza', 'oficina', 'Limpieza de oficina'),
  ('limpieza', 'profunda', 'Limpieza profunda'),
  ('cuidado', 'adulto-mayor', 'Adulto mayor'),
  ('cuidado', 'ninos', 'Niños'),
  ('cuidado', 'enfermos', 'Personas enfermas'),
  ('chofer', 'particular', 'Chofer particular'),
  ('chofer', 'mudanza', 'Mudanzas y fletes'),
  ('chofer', 'escolar', 'Movilidad escolar')
) v (trade_slug, slug, name) on v.trade_slug = t.slug
on conflict (trade_id, slug) do nothing;

create table public.pro_trade_specialties (
  pro_trade_id uuid not null references public.pro_trades (id) on delete cascade,
  specialty_id smallint not null references public.trade_specialties (id),
  primary key (pro_trade_id, specialty_id)
);
create index on public.pro_trade_specialties (specialty_id);
alter table public.pro_trade_specialties enable row level security;
grant select on public.pro_trade_specialties to authenticated;
-- Visible para quien ve el oficio (el pro, soporte o cualquiera si está aprobado).
create policy "subespecialidades del pro: si se ve el oficio" on public.pro_trade_specialties
  for select to authenticated
  using (exists (select 1 from public.pro_trades pt where pt.id = pro_trade_id));

create function public.set_pro_trade_specialties(p_pro_trade uuid, p_specialties smallint[])
returns void
language plpgsql security definer set search_path = '' as $$
declare v public.pro_trades;
begin
  select * into v from public.pro_trades where id = p_pro_trade and pro_id = (select auth.uid()) for update;
  if not found then
    raise exception 'Oficio no encontrado' using errcode = 'P0002';
  end if;
  if v.status not in ('draft', 'needs_info') then
    raise exception 'Este oficio ya fue enviado' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_specialties, '{}')) s (id)
    where not exists (
      select 1 from public.trade_specialties ts where ts.id = s.id and ts.trade_id = v.trade_id and ts.active
    )
  ) then
    raise exception 'Esa especialidad no es de este oficio' using errcode = '22023';
  end if;
  delete from public.pro_trade_specialties where pro_trade_id = p_pro_trade;
  insert into public.pro_trade_specialties (pro_trade_id, specialty_id)
  select distinct p_pro_trade, s from unnest(coalesce(p_specialties, '{}')) s;
end $$;
revoke execute on function public.set_pro_trade_specialties(uuid, smallint[]) from public, anon;
grant execute on function public.set_pro_trade_specialties(uuid, smallint[]) to authenticated;

-- ═════════════ Datos del DNI (mayor de 18) ═════════════
create table public.pro_identity (
  pro_id uuid primary key references public.profiles (id) on delete cascade,
  dni_number text not null check (dni_number ~ '^[0-9]{8}$'),
  birth_date date not null check (birth_date > date '1900-01-01'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index pro_identity_dni_number_key on public.pro_identity (dni_number);
alter table public.pro_identity enable row level security;
grant select on public.pro_identity to authenticated;
create policy "identidad: propia o soporte" on public.pro_identity for select to authenticated
  using (pro_id = (select auth.uid()) or public.is_staff());

create function public.save_pro_identity(p_dni text, p_birth_date date) returns public.pro_identity
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_dni text := regexp_replace(coalesce(p_dni, ''), '\D', '', 'g');
  v public.pro_identity;
begin
  if v_uid is null then
    raise exception 'Inicia sesión' using errcode = '42501';
  end if;
  if v_dni !~ '^[0-9]{8}$' then
    raise exception 'El DNI tiene 8 números' using errcode = '22023';
  end if;
  if p_birth_date is null or p_birth_date <= date '1900-01-01' then
    raise exception 'Revisa tu fecha de nacimiento' using errcode = '22023';
  end if;
  if p_birth_date > ((now() at time zone 'America/Lima')::date - interval '18 years')::date then
    raise exception 'Debes ser mayor de 18 años para ofrecer servicios en Cerquita' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.pro_trades
    where pro_id = v_uid and status in ('submitted', 'in_review', 'approved_observation', 'approved_full')
  ) and exists (
    select 1 from public.pro_identity where pro_id = v_uid and (dni_number <> v_dni or birth_date <> p_birth_date)
  ) then
    raise exception 'Tus datos ya están en revisión. Para cambiarlos, escríbenos a soporte.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.pro_identity where dni_number = v_dni and pro_id <> v_uid) then
    raise exception 'Este DNI ya está registrado en otra cuenta. Escríbenos a soporte.' using errcode = '23505';
  end if;
  insert into public.pro_identity (pro_id, dni_number, birth_date)
  values (v_uid, v_dni, p_birth_date)
  on conflict (pro_id) do update set dni_number = excluded.dni_number, birth_date = excluded.birth_date, updated_at = now()
  returning * into v;
  return v;
end $$;
revoke execute on function public.save_pro_identity(text, date) from public, anon;
grant execute on function public.save_pro_identity(text, date) to authenticated;

-- ═════════════ Documentos: descripción de fotos y duración del video ═════════════
alter table public.verification_documents
  add column description text check (char_length(description) <= 200),
  add column duration_seconds smallint check (duration_seconds between 1 and 600);
grant insert (description, duration_seconds) on public.verification_documents to authenticated;

create function private.check_verification_document() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_risk text;
begin
  if new.kind = 'verification_video' then
    if new.pro_trade_id is null then
      raise exception 'El video va en cada oficio' using errcode = '22023';
    end if;
    if new.duration_seconds is null
       or new.duration_seconds < private.setting_int('verification_video_min_seconds', 60)
       or new.duration_seconds > private.setting_int('verification_video_max_seconds', 180) then
      raise exception 'El video debe durar entre % y % minutos',
        private.setting_int('verification_video_min_seconds', 60) / 60,
        private.setting_int('verification_video_max_seconds', 180) / 60 using errcode = '22023';
    end if;
  end if;
  if new.kind = 'work_photo' and new.pro_trade_id is not null then
    select t.risk_level into v_risk
    from public.pro_trades pt join public.trades t on t.id = pt.trade_id
    where pt.id = new.pro_trade_id;
    if v_risk = 'skill' then
      if char_length(btrim(coalesce(new.description, ''))) < 3 then
        raise exception 'Cuenta en pocas palabras qué trabajo se ve en la foto' using errcode = '22023';
      end if;
      if (select count(*) from public.verification_documents d
          where d.pro_trade_id = new.pro_trade_id and d.kind = 'work_photo')
         >= private.setting_int('skill_max_photos', 5) then
        raise exception 'Puedes subir hasta % fotos por oficio', private.setting_int('skill_max_photos', 5)
          using errcode = 'P0001';
      end if;
    end if;
  end if;
  new.description := nullif(btrim(new.description), '');
  return new;
end $$;
create trigger check_verification_document before insert on public.verification_documents
  for each row execute function private.check_verification_document();

update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf',
                               'video/mp4', 'video/quicktime', 'video/webm']
where id = 'verification';

-- ═════════════ Antecedentes: solo el resultado por oficio ═════════════
create table public.pro_background_checks (
  pro_trade_id uuid primary key references public.pro_trades (id) on delete cascade,
  result text not null check (result in ('apto', 'con_restriccion', 'no_apto')),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz not null default now()
);
create index on public.pro_background_checks (reviewed_by);
alter table public.pro_background_checks enable row level security;
grant select on public.pro_background_checks to authenticated;
create policy "antecedentes: el propio pro o soporte" on public.pro_background_checks for select to authenticated
  using (
    public.is_staff()
    or exists (select 1 from public.pro_trades pt where pt.id = pro_trade_id and pt.pro_id = (select auth.uid()))
  );

-- Vale el certificado subido o un resultado favorable vigente sin un "no apto" vigente.
create function private.has_background(p_pro uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
      select 1 from public.verification_documents d
      where d.pro_id = p_pro and d.kind = 'background' and d.pro_trade_id is null
    )
    or (
      exists (
        select 1 from public.pro_background_checks b join public.pro_trades pt on pt.id = b.pro_trade_id
        where pt.pro_id = p_pro and b.result in ('apto', 'con_restriccion')
          and b.reviewed_at > now() - make_interval(days => private.setting_int('background_valid_days', 365))
      )
      and not exists (
        select 1 from public.pro_background_checks b join public.pro_trades pt on pt.id = b.pro_trade_id
        where pt.pro_id = p_pro and b.result = 'no_apto'
          and b.reviewed_at > now() - make_interval(days => private.setting_int('background_valid_days', 365))
      )
    )
$$;

-- ═════════════ Requisitos según el riesgo ═════════════
create or replace function private.trade_requirements(p_trade smallint)
returns table (requirement text, min_count int)
language sql stable security definer set search_path = '' as $$
  select r.requirement, r.min_count from public.trades t
  cross join lateral (
    select v.requirement, v.min_count from (values
      (1, 'specialty', 1, array['high', 'trust', 'skill']),
      (2, 'work_photo', private.setting_int('min_trade_evidence', 2), array['high']),
      (3, 'certificate', 1, array['high']),
      (4, 'work_photo', private.setting_int('skill_min_photos', 3), array['skill']),
      (5, 'reference', private.setting_int('domestic_min_references', 2), array['trust']),
      (6, 'verification_video', 1, array['high', 'trust', 'skill'])
    ) v (ord, requirement, min_count, levels)
    where t.risk_level = any (v.levels)
    union all
    select d.requirement, d.min_count from (values (7, 'driver_license', 1), (8, 'driver_record', 1)) d (ord, requirement, min_count)
    where t.category = 'driver'
  ) r
  where t.id = p_trade
$$;

create or replace function private.pro_trade_missing(p_pro_trade uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  with pt as (
    select p.id, p.pro_id, p.trade_id, t.risk_level
    from public.pro_trades p join public.trades t on t.id = p.trade_id
    where p.id = p_pro_trade
  ),
  identity_missing as (
    select 'identity_data'::text as item, 0 as ord from pt
    where not exists (select 1 from public.pro_identity i where i.pro_id = pt.pro_id)
    union all
    select k::text, 1 from pt, unnest(array['dni_front', 'dni_back', 'selfie']::public.verification_document_kind[]) k
    where not exists (
      select 1 from public.verification_documents d where d.pro_id = pt.pro_id and d.kind = k and d.pro_trade_id is null
    )
    union all
    select 'background', 2 from pt where not private.has_background(pt.pro_id)
  ),
  trade_missing as (
    select r.requirement as item, row_number() over () as ord
    from pt cross join lateral private.trade_requirements(pt.trade_id) r
    where (
      case r.requirement
        when 'specialty' then (select count(*) from public.pro_trade_specialties s where s.pro_trade_id = pt.id)
        else (
          select count(*) from public.verification_documents d
          where d.pro_trade_id = pt.id and d.kind::text = r.requirement
            and (r.requirement <> 'work_photo' or pt.risk_level <> 'skill' or d.description is not null)
        )
      end
    ) < r.min_count
  )
  select coalesce((select array_agg(item order by ord, item) from identity_missing), '{}')
      || coalesce((select array_agg(item order by ord) from trade_missing), '{}')
$$;

-- ═════════════ Historial de cambios (responsable y motivo) ═════════════
create table public.pro_trade_events (
  id bigint generated always as identity primary key,
  pro_trade_id uuid not null references public.pro_trades (id) on delete cascade,
  from_status public.pro_trade_status,
  to_status public.pro_trade_status not null,
  reason text,
  actor_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.pro_trade_events (pro_trade_id, created_at);
create index on public.pro_trade_events (actor_id);
alter table public.pro_trade_events enable row level security;
grant select on public.pro_trade_events to authenticated;
create policy "historial: el propio pro o soporte" on public.pro_trade_events for select to authenticated
  using (
    public.is_staff()
    or exists (select 1 from public.pro_trades pt where pt.id = pro_trade_id and pt.pro_id = (select auth.uid()))
  );

create function private.log_pro_trade_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.pro_trade_events (pro_trade_id, from_status, to_status, reason, actor_id)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status,
      case when new.status in ('needs_info', 'rejected', 'suspended', 'approved_observation') then new.reason end,
      (select auth.uid()));
  end if;
  return new;
end $$;
create trigger log_pro_trade_event after insert or update of status on public.pro_trades
  for each row execute function private.log_pro_trade_event();

-- ═════════════ Envío y revisión ═════════════
alter table public.pro_trades add column submitted_at timestamptz;

create or replace function public.submit_pro_trade(p_pro_trade uuid) returns public.pro_trades
language plpgsql security definer set search_path = '' as $$
declare
  v public.pro_trades;
  v_missing text[];
begin
  select * into v from public.pro_trades where id = p_pro_trade and pro_id = (select auth.uid()) for update;
  if not found then
    raise exception 'Oficio no encontrado' using errcode = 'P0002';
  end if;
  if v.status = 'rejected' then
    if v.reviewed_at > now() - make_interval(days => private.setting_int('reject_retry_days', 30)) then
      raise exception 'Podrás volver a enviar este oficio desde el %',
        to_char(v.reviewed_at + make_interval(days => private.setting_int('reject_retry_days', 30)), 'DD/MM/YYYY')
        using errcode = 'P0001';
    end if;
  elsif v.status not in ('draft', 'needs_info') then
    raise exception 'Este oficio ya fue enviado' using errcode = 'P0001';
  end if;
  v_missing := private.pro_trade_missing(p_pro_trade);
  if cardinality(v_missing) > 0 then
    raise exception 'Falta: %', array_to_string(v_missing, ', ') using errcode = 'P0001';
  end if;
  update public.pro_trades set status = 'submitted', submitted_at = now()
  where id = p_pro_trade returning * into v;
  return v;
end $$;

drop function public.review_pro_trade(uuid, text, text);
create function public.review_pro_trade(
  p_pro_trade uuid, p_decision text, p_reason text default null, p_background text default null
) returns public.pro_trades
language plpgsql security definer set search_path = '' as $$
declare
  v public.pro_trades;
  v_reason text := nullif(btrim(p_reason), '');
  v_background text := nullif(btrim(p_background), '');
  v_status public.pro_trade_status;
begin
  if not public.is_staff() then
    raise exception 'Solo soporte puede revisar oficios' using errcode = '42501';
  end if;
  select * into v from public.pro_trades where id = p_pro_trade for update;
  if not found then
    raise exception 'Oficio no encontrado' using errcode = 'P0002';
  end if;

  if p_decision = 'start' then
    if v.status <> 'submitted' then
      return v;
    end if;
    update public.pro_trades set status = 'in_review', reviewed_by = auth.uid()
    where id = p_pro_trade returning * into v;
    return v;
  end if;

  if v.status not in ('submitted', 'in_review') then
    raise exception 'El oficio no está esperando revisión (estado: %)', v.status using errcode = 'P0001';
  end if;
  if v_background is not null and v_background not in ('apto', 'con_restriccion', 'no_apto') then
    raise exception 'Resultado de antecedentes inválido: %', v_background using errcode = '22023';
  end if;

  case p_decision
    when 'approve' then
      if cardinality(private.pro_trade_missing(p_pro_trade)) > 0 then
        raise exception 'Falta evidencia para aprobar: %', array_to_string(private.pro_trade_missing(p_pro_trade), ', ')
          using errcode = 'P0001';
      end if;
      if v_background is null then
        raise exception 'Indica el resultado de antecedentes (apto o con restricción)' using errcode = '22023';
      end if;
      if v_background = 'no_apto' then
        raise exception 'Con antecedentes "no apto" el oficio no se puede aprobar' using errcode = 'P0001';
      end if;
      v_status := 'approved_observation';
    when 'needs_info' then
      v_status := 'needs_info';
    when 'reject' then
      v_status := 'rejected';
    else
      raise exception 'Decisión inválida: %', p_decision using errcode = '22023';
  end case;

  if v_status in ('needs_info', 'rejected') and v_reason is null then
    raise exception 'El motivo es obligatorio para pedir más evidencia o rechazar' using errcode = '22023';
  end if;

  update public.pro_trades
  set status = v_status, reviewed_by = auth.uid(), reviewed_at = now(), reason = v_reason,
      good_ratings_count = case when v_status = 'approved_observation' then 0 else good_ratings_count end
  where id = p_pro_trade
  returning * into v;

  if v_background is not null then
    insert into public.pro_background_checks (pro_trade_id, result, reviewed_by)
    values (p_pro_trade, v_background, auth.uid())
    on conflict (pro_trade_id) do update
      set result = excluded.result, reviewed_by = excluded.reviewed_by, reviewed_at = now();
    -- Minimización: con el resultado guardado, el certificado ya no hace falta si no queda otro oficio en revisión.
    if not exists (
      select 1 from public.pro_trades where pro_id = v.pro_id and status in ('submitted', 'in_review')
    ) then
      delete from public.verification_documents
      where pro_id = v.pro_id and kind = 'background' and pro_trade_id is null;
    end if;
  end if;
  return v;
end $$;
revoke execute on function public.review_pro_trade(uuid, text, text, text) from public, anon;
grant execute on function public.review_pro_trade(uuid, text, text, text) to authenticated;

-- Cola de verificación para el panel: primero el riesgo alto, luego lo más antiguo.
create function public.verification_queue()
returns table (
  pro_trade_id uuid, pro_id uuid, pro_name text, trade_name text, risk_level text,
  status public.pro_trade_status, submitted_at timestamptz, waiting_hours numeric, overdue boolean, missing text[]
)
language sql stable security definer set search_path = '' as $$
  select pt.id, pt.pro_id, p.full_name, t.pro_name, t.risk_level, pt.status,
    coalesce(pt.submitted_at, pt.updated_at),
    round((extract(epoch from now() - coalesce(pt.submitted_at, pt.updated_at)) / 3600)::numeric, 1),
    coalesce(pt.submitted_at, pt.updated_at) < now() - make_interval(hours => private.setting_int('review_alert_hours', 24)),
    private.pro_trade_missing(pt.id)
  from public.pro_trades pt
  join public.trades t on t.id = pt.trade_id
  join public.profiles p on p.id = pt.pro_id
  where public.is_staff() and pt.status in ('submitted', 'in_review')
  order by case t.risk_level when 'high' then 0 when 'trust' then 1 else 2 end,
    coalesce(pt.submitted_at, pt.updated_at)
$$;
revoke execute on function public.verification_queue() from public, anon;
grant execute on function public.verification_queue() to authenticated;

-- ═════════════ Eliminar cuenta: también los datos del DNI y los resultados de antecedentes ═════════════
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
  delete from public.pro_identity where pro_id = v_uid;
  delete from public.pro_background_checks b using public.pro_trades pt
  where pt.id = b.pro_trade_id and pt.pro_id = v_uid;
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
