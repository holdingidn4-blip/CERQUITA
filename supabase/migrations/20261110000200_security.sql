-- Fase 2 · Seguridad: permisos, RLS, triggers de guarda, libro inmutable y retención.
-- Principio: nada está permitido salvo lo que se concede aquí de forma explícita.

-- ───────────────────────── Permisos base ─────────────────────────
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function public.is_staff() to authenticated;

alter table public.profiles enable row level security;
alter table public.trades enable row level security;
alter table public.pro_trades enable row level security;
alter table public.verification_documents enable row level security;
alter table public.document_access_log enable row level security;
alter table public.pro_presence enable row level security;
alter table public.jobs enable row level security;
alter table public.offers enable row level security;
alter table public.job_tracks enable row level security;
alter table public.wallet_entries enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.ratings enable row level security;
alter table public.trusted_contacts enable row level security;
alter table public.sos_alerts enable row level security;
alter table public.settings enable row level security;

-- ───────────────────────── Ayudantes (saltan RLS para evitar recursión) ─────────────────────────
-- ¿Quién llama es un usuario de la API (y no una función del servidor)?
create function private.is_api_user() returns boolean
language sql stable set search_path = '' as $$
  select current_user in ('anon', 'authenticated')
$$;

create function private.try_uuid(p text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

create function private.job_client_id(p_job uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select client_id from public.jobs where id = p_job
$$;

create function private.job_status(p_job uuid) returns public.job_status
language sql stable security definer set search_path = '' as $$
  select status from public.jobs where id = p_job
$$;

create function private.job_assigned_pro_id(p_job uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select o.pro_id from public.jobs j join public.offers o on o.id = j.accepted_offer_id where j.id = p_job
$$;

-- Regla 4: oficio aprobado + en línea + dentro del radio.
create function private.pro_is_eligible(p_trade smallint, p_point extensions.geography) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.pro_trades pt
    join public.pro_presence pp on pp.pro_id = pt.pro_id
    where pt.pro_id = (select auth.uid())
      and pt.trade_id = p_trade
      and pt.status in ('approved_observation', 'approved_full')
      and pp.online
      and pp.last_point is not null
      and extensions.st_dwithin(pp.last_point, p_point, pp.radius_m)
  )
$$;

create function private.pro_is_eligible_for_job(p_job uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select private.pro_is_eligible(j.trade_id, j.approx_point)
    from public.jobs j where j.id = p_job
  ), false)
$$;

grant execute on all functions in schema private to authenticated;
revoke execute on function private.handle_new_user() from authenticated;

-- ───────────────────────── profiles ─────────────────────────
grant select, update (full_name, avatar_url, active_role) on public.profiles to authenticated;
create policy "profiles: leer el propio" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_staff());
create policy "profiles: editar el propio" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Datos públicos mínimos (sin teléfono) para mostrar nombre y foto en ofertas y perfiles.
create function public.public_profiles(p_ids uuid[])
returns table (id uuid, full_name text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.avatar_url from public.profiles p
  where p.id = any (p_ids) and p.deleted_at is null and (select auth.uid()) is not null
$$;
grant execute on function public.public_profiles(uuid[]) to authenticated;

-- ───────────────────────── trades y settings ─────────────────────────
grant select on public.trades to anon, authenticated;
grant insert, update, delete on public.trades to authenticated;
create policy "trades: lectura pública" on public.trades for select to anon, authenticated using (true);
create policy "trades: soporte edita" on public.trades for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

grant select, insert, update, delete on public.settings to authenticated;
create policy "settings: lectura" on public.settings for select to authenticated using (true);
create policy "settings: soporte edita" on public.settings for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ───────────────────────── pro_trades ─────────────────────────
grant select, insert (pro_id, trade_id, status), update (status) on public.pro_trades to authenticated;
grant update (status, reviewed_by, reviewed_at, reason) on public.pro_trades to authenticated;
create policy "pro_trades: leer propios, aprobados o soporte" on public.pro_trades for select to authenticated
  using (
    pro_id = (select auth.uid()) or public.is_staff()
    or status in ('approved_observation', 'approved_full')
  );
create policy "pro_trades: crear propios" on public.pro_trades for insert to authenticated
  with check (pro_id = (select auth.uid()) and status in ('draft', 'submitted'));
create policy "pro_trades: editar propios" on public.pro_trades for update to authenticated
  using (pro_id = (select auth.uid())) with check (pro_id = (select auth.uid()));
create policy "pro_trades: soporte revisa" on public.pro_trades for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create function private.guard_pro_trade() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not private.is_api_user() or public.is_staff() then
    return new;
  end if;
  if new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at
     or new.reason is distinct from old.reason
     or new.good_ratings_count is distinct from old.good_ratings_count then
    raise exception 'Solo soporte puede cambiar la revisión' using errcode = '42501';
  end if;
  if new.status = old.status then
    return new;
  end if;
  if (old.status in ('draft', 'needs_info') and new.status = 'submitted')
     or (old.status = 'rejected' and new.status = 'submitted' and old.reviewed_at < now() - interval '30 days') then
    return new;
  end if;
  raise exception 'Cambio de estado no permitido: % → %', old.status, new.status using errcode = '42501';
end $$;
create trigger guard_pro_trade before update on public.pro_trades
  for each row execute function private.guard_pro_trade();

-- ───────────────────────── verification_documents y registro de acceso ─────────────────────────
grant select, insert (pro_id, pro_trade_id, kind, storage_path) on public.verification_documents to authenticated;
create policy "docs: leer propios o soporte" on public.verification_documents for select to authenticated
  using (pro_id = (select auth.uid()) or public.is_staff());
create policy "docs: subir propios" on public.verification_documents for insert to authenticated
  with check (
    pro_id = (select auth.uid())
    and storage_path like (select auth.uid())::text || '/%'
    and (pro_trade_id is null or exists (
      select 1 from public.pro_trades pt where pt.id = pro_trade_id and pt.pro_id = (select auth.uid())
    ))
  );

grant select on public.document_access_log to authenticated;
create policy "access_log: soporte lee" on public.document_access_log for select to authenticated
  using (public.is_staff());

-- Regla 6: toda vista de un documento sensible pasa por aquí. Devuelve la ruta para firmarla.
create function public.log_document_access(p_document uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_path text;
begin
  if not public.is_staff() then
    raise exception 'Solo soporte puede ver documentos de verificación' using errcode = '42501';
  end if;
  select storage_path into v_path from public.verification_documents where id = p_document;
  if v_path is null then
    raise exception 'Documento no encontrado' using errcode = 'P0002';
  end if;
  insert into public.document_access_log (document_id, viewer_id) values (p_document, auth.uid());
  return v_path;
end $$;
grant execute on function public.log_document_access(uuid) to authenticated;

-- ───────────────────────── pro_presence ─────────────────────────
grant select, insert (pro_id, online, radius_m, last_point), update (online, radius_m, last_point)
  on public.pro_presence to authenticated;
create policy "presence: leer propia o soporte" on public.pro_presence for select to authenticated
  using (pro_id = (select auth.uid()) or public.is_staff());
create policy "presence: crear propia" on public.pro_presence for insert to authenticated
  with check (pro_id = (select auth.uid()));
create policy "presence: editar propia" on public.pro_presence for update to authenticated
  using (pro_id = (select auth.uid())) with check (pro_id = (select auth.uid()));

-- ───────────────────────── jobs ─────────────────────────
-- Regla 7: exact_address no se concede en SELECT; se obtiene con job_exact_address().
alter table public.jobs alter column client_id set default auth.uid();
grant select (
  id, client_id, trade_id, description, photos, offered_price_cents, approx_point, status,
  accepted_offer_id, final_price_cents, commission_rate_bps, created_at, updated_at
) on public.jobs to authenticated;
grant insert (client_id, trade_id, description, photos, offered_price_cents, approx_point, exact_address)
  on public.jobs to authenticated;
grant update (description, photos, offered_price_cents, status) on public.jobs to authenticated;

create policy "jobs: leer" on public.jobs for select to authenticated
  using (
    client_id = (select auth.uid())
    or public.is_staff()
    or (status in ('published', 'with_offers') and private.pro_is_eligible(trade_id, approx_point))
    or private.job_assigned_pro_id(id) = (select auth.uid())
  );
create policy "jobs: crear propios" on public.jobs for insert to authenticated
  with check (client_id = (select auth.uid()) and status = 'published');
create policy "jobs: editar propios antes de aceptar" on public.jobs for update to authenticated
  using (client_id = (select auth.uid()) and status in ('published', 'with_offers'))
  with check (client_id = (select auth.uid()));

create function private.guard_job() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    -- Zona aproximada: se redondea a ~110 m para que los profesionales no vean el punto exacto.
    new.approx_point := extensions.st_setsrid(extensions.st_makepoint(
      round(extensions.st_x(new.approx_point::extensions.geometry)::numeric, 3)::float8,
      round(extensions.st_y(new.approx_point::extensions.geometry)::numeric, 3)::float8
    ), 4326)::extensions.geography;
    if private.is_api_user() then
      new.status := 'published';
      new.accepted_offer_id := null;
      new.final_price_cents := null;
      new.commission_rate_bps := null;
    end if;
    return new;
  end if;
  if private.is_api_user() and not public.is_staff() and new.status is distinct from old.status
     and new.status <> 'cancelled' then
    raise exception 'El cliente solo puede cancelar el pedido' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_job before insert or update on public.jobs
  for each row execute function private.guard_job();

create function public.job_exact_address(p_job uuid) returns text
language sql stable security definer set search_path = '' as $$
  select j.exact_address from public.jobs j
  where j.id = p_job and (
    j.client_id = (select auth.uid())
    or (
      private.job_assigned_pro_id(j.id) = (select auth.uid())
      and j.status in ('accepted', 'on_the_way', 'at_home', 'finished')
    )
  )
$$;
grant execute on function public.job_exact_address(uuid) to authenticated;

-- Teléfono del otro participante, solo con la oferta aceptada y el servicio activo.
create function public.job_counterpart_phone(p_job uuid) returns text
language sql stable security definer set search_path = '' as $$
  select p.phone
  from public.jobs j
  join public.profiles p on p.id = case
    when j.client_id = (select auth.uid()) then private.job_assigned_pro_id(j.id)
    when private.job_assigned_pro_id(j.id) = (select auth.uid()) then j.client_id
  end
  where j.id = p_job and j.status in ('accepted', 'on_the_way', 'at_home', 'finished')
$$;
grant execute on function public.job_counterpart_phone(uuid) to authenticated;

-- ───────────────────────── offers ─────────────────────────
alter table public.offers alter column pro_id set default auth.uid();
grant select, insert (job_id, pro_id, price_cents, message), update (price_cents, message, status)
  on public.offers to authenticated;
create policy "offers: leer" on public.offers for select to authenticated
  using (
    pro_id = (select auth.uid())
    or private.job_client_id(job_id) = (select auth.uid())
    or public.is_staff()
  );
create policy "offers: crear si el pro es elegible" on public.offers for insert to authenticated
  with check (
    pro_id = (select auth.uid())
    and status = 'pending'
    and private.job_client_id(job_id) <> (select auth.uid())
    and private.job_status(job_id) in ('published', 'with_offers')
    and private.pro_is_eligible_for_job(job_id)
  );
create policy "offers: editar propias pendientes" on public.offers for update to authenticated
  using (pro_id = (select auth.uid()) and status = 'pending')
  with check (pro_id = (select auth.uid()) and status in ('pending', 'withdrawn'));

create function private.on_offer_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.jobs set status = 'with_offers' where id = new.job_id and status = 'published';
  return new;
end $$;
create trigger on_offer_created after insert on public.offers
  for each row execute function private.on_offer_created();

-- ───────────────────────── job_tracks (regla 5) ─────────────────────────
grant select, insert (job_id, point) on public.job_tracks to authenticated;
create policy "tracks: leer participantes" on public.job_tracks for select to authenticated
  using (
    private.job_client_id(job_id) = (select auth.uid())
    or private.job_assigned_pro_id(job_id) = (select auth.uid())
    or public.is_staff()
  );
create policy "tracks: solo el pro asignado en camino o en el domicilio" on public.job_tracks
  for insert to authenticated
  with check (
    private.job_assigned_pro_id(job_id) = (select auth.uid())
    and private.job_status(job_id) in ('on_the_way', 'at_home')
  );

-- ───────────────────────── wallet_entries (regla 2) ─────────────────────────
grant select on public.wallet_entries to authenticated;
revoke insert, update, delete, truncate on public.wallet_entries from service_role;
create policy "wallet: leer el propio o soporte" on public.wallet_entries for select to authenticated
  using (professional_id = (select auth.uid()) or public.is_staff());

create function private.wallet_before_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Un bloqueo por profesional serializa los asientos y hace exacto el saldo.
  perform pg_advisory_xact_lock(hashtextextended('wallet:' || new.professional_id::text, 0));
  select coalesce(sum(amount_cents), 0) + new.amount_cents into new.balance_after_cents
  from public.wallet_entries where professional_id = new.professional_id;
  new.created_at := clock_timestamp();
  return new;
end $$;
create trigger wallet_before_insert before insert on public.wallet_entries
  for each row execute function private.wallet_before_insert();

create function private.forbid_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% es inmutable: corrige con un asiento nuevo', tg_table_name using errcode = '42501';
end $$;
create trigger wallet_immutable before update or delete on public.wallet_entries
  for each row execute function private.forbid_change();
create trigger access_log_immutable before update or delete on public.document_access_log
  for each row execute function private.forbid_change();

-- Única puerta de escritura del libro. Idempotente por idempotency_key.
create function public.wallet_post_entry(
  p_professional uuid,
  p_type public.wallet_entry_type,
  p_amount_cents int,
  p_idempotency_key text,
  p_job uuid default null,
  p_external_ref text default null,
  p_created_by uuid default null
) returns public.wallet_entries
language plpgsql security definer set search_path = '' as $$
declare
  v_entry public.wallet_entries;
begin
  perform pg_advisory_xact_lock(hashtextextended('wallet:' || p_professional::text, 0));
  select * into v_entry from public.wallet_entries where idempotency_key = p_idempotency_key;
  if found then
    if v_entry.professional_id <> p_professional or v_entry.amount_cents <> p_amount_cents
       or v_entry.type <> p_type then
      raise exception 'idempotency_key % ya existe con otros datos', p_idempotency_key using errcode = '23505';
    end if;
    return v_entry;
  end if;
  insert into public.wallet_entries
    (professional_id, job_id, type, amount_cents, external_ref, idempotency_key, created_by)
  values
    (p_professional, p_job, p_type, p_amount_cents, p_external_ref, p_idempotency_key, p_created_by)
  returning * into v_entry;
  return v_entry;
end $$;
revoke execute on function public.wallet_post_entry from public, anon, authenticated;
grant execute on function public.wallet_post_entry to service_role;

-- ───────────────────────── payment_proofs ─────────────────────────
grant select, insert (professional_id, method, operation_code, amount_cents, image_path)
  on public.payment_proofs to authenticated;
grant update (status, reviewed_by, reviewed_at) on public.payment_proofs to authenticated;
create policy "proofs: leer propias o soporte" on public.payment_proofs for select to authenticated
  using (professional_id = (select auth.uid()) or public.is_staff());
create policy "proofs: subir propias" on public.payment_proofs for insert to authenticated
  with check (
    professional_id = (select auth.uid())
    and status = 'pending'
    and image_path like (select auth.uid())::text || '/%'
  );
create policy "proofs: soporte revisa" on public.payment_proofs for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ───────────────────────── ratings ─────────────────────────
grant select, insert (job_id, from_id, to_id, stars, tags, comment) on public.ratings to authenticated;
create policy "ratings: lectura" on public.ratings for select to authenticated using (true);
create policy "ratings: solo trabajos confirmados" on public.ratings for insert to authenticated
  with check (
    from_id = (select auth.uid())
    and private.job_status(job_id) in ('confirmed', 'rated')
    and (
      (private.job_client_id(job_id) = from_id and private.job_assigned_pro_id(job_id) = to_id)
      or (private.job_assigned_pro_id(job_id) = from_id and private.job_client_id(job_id) = to_id)
    )
  );

-- ───────────────────────── trusted_contacts ─────────────────────────
alter table public.trusted_contacts alter column user_id set default auth.uid();
grant select, insert (user_id, name, phone, relation), update (name, phone, relation), delete
  on public.trusted_contacts to authenticated;
create policy "contacts: solo los propios" on public.trusted_contacts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create function private.limit_trusted_contacts() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('contacts:' || new.user_id::text, 0));
  if (select count(*) from public.trusted_contacts where user_id = new.user_id) >= 3 then
    raise exception 'Máximo 3 contactos de confianza' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger limit_trusted_contacts before insert on public.trusted_contacts
  for each row execute function private.limit_trusted_contacts();

-- ───────────────────────── sos_alerts ─────────────────────────
alter table public.sos_alerts alter column user_id set default auth.uid();
grant select, insert (job_id, user_id, status), update (status, closed_at, closed_by, note)
  on public.sos_alerts to authenticated;
create policy "sos: leer propias o soporte" on public.sos_alerts for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff());
create policy "sos: crear propia" on public.sos_alerts for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status in ('countdown', 'open')
    and (job_id is null or (select auth.uid()) in (private.job_client_id(job_id), private.job_assigned_pro_id(job_id)))
  );
create policy "sos: editar propia" on public.sos_alerts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "sos: soporte cierra" on public.sos_alerts for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create function private.guard_sos() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not private.is_api_user() then
    return new;
  end if;
  if public.is_staff() then
    if new.status = 'closed' then
      new.closed_at := coalesce(new.closed_at, now());
      new.closed_by := auth.uid();
    end if;
    return new;
  end if;
  if new.closed_by is distinct from old.closed_by or new.note is distinct from old.note
     or new.closed_at is distinct from old.closed_at
     or not (old.status = 'countdown' and new.status in ('countdown', 'open', 'cancelled')) then
    raise exception 'Solo soporte puede cerrar una alerta SOS' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_sos before update on public.sos_alerts
  for each row execute function private.guard_sos();

-- ───────────────────────── Retención: rastro GPS 30 días ─────────────────────────
create extension if not exists pg_cron;
select cron.schedule(
  'purge-job-tracks', '17 3 * * *',
  $$delete from public.job_tracks where recorded_at < now() - interval '30 days'$$
);
