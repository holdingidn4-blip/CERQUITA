-- Fase 8 · Eliminar cuenta, limpieza de archivos en Storage y SOS.

-- ───────────────────────── Eliminar cuenta (Apple 5.1.1(v), Ley 29733) ─────────────────────────
-- Borra o anonimiza los datos personales. Conserva lo que la ley exige (libro de comisiones,
-- pedidos y calificaciones sin datos que identifiquen). TODO(decidir): plazos de retención con abogado.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Inicia sesión para eliminar tu cuenta' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.jobs j
    where j.status in ('accepted', 'on_the_way', 'at_home', 'finished')
      and (j.client_id = v_uid or private.job_assigned_pro_id(j.id) = v_uid)
  ) then
    raise exception 'Tienes un servicio en curso. Termínalo o cancélalo antes de eliminar tu cuenta.' using errcode = 'P0001';
  end if;

  -- Pedidos abiertos y ofertas pendientes dejan de existir para los demás.
  update public.jobs set status = 'cancelled', cancelled_by = v_uid, cancel_reason = 'Cuenta eliminada'
  where client_id = v_uid and status in ('published', 'with_offers');
  update public.offers set status = 'withdrawn' where pro_id = v_uid and status = 'pending';

  -- Datos personales y documentos (los archivos los borra la limpieza de Storage).
  delete from public.trusted_contacts where user_id = v_uid;
  delete from public.pro_presence where pro_id = v_uid;
  delete from public.verification_documents where pro_id = v_uid;
  update public.pro_trades set status = 'suspended', reason = 'Cuenta eliminada' where pro_id = v_uid;
  update public.jobs set exact_address = 'Dirección eliminada', photos = '{}' where client_id = v_uid;
  update public.ratings set comment = null where from_id = v_uid;
  delete from public.job_messages where sender_id = v_uid;
  update public.profiles set full_name = null, phone = null, avatar_url = null, deleted_at = now() where id = v_uid;

  -- La cuenta de acceso queda sin teléfono y bloqueada; se cierran todas las sesiones.
  update auth.users set phone = null, phone_confirmed_at = null, raw_user_meta_data = '{}'::jsonb,
    banned_until = 'infinity', updated_at = now()
  where id = v_uid;
  delete from auth.refresh_tokens where user_id = v_uid::text;
  delete from auth.sessions where user_id = v_uid;
end $$;
grant execute on function public.delete_my_account() to authenticated;

-- El trigger que sincroniza el teléfono no debe revivir el perfil borrado.
create or replace function private.sync_profile_phone() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set phone = new.phone where id = new.id and deleted_at is null;
  return new;
end $$;

-- ───────────────────────── Archivos huérfanos en Storage ─────────────────────────
-- Archivos sin fila que los use (borradores quitados, subidas a medias, cuentas eliminadas).
-- Margen de 1 día para no borrar una subida en curso. Solo el servidor (service role) lo usa.
create function public.storage_orphans(p_min_age interval default interval '1 day')
returns table (bucket_id text, name text)
language sql stable security definer set search_path = '' as $$
  select o.bucket_id, o.name from storage.objects o
  where o.created_at < now() - p_min_age
    and case o.bucket_id
      when 'verification' then not exists (select 1 from public.verification_documents d where d.storage_path = o.name)
      when 'job-photos' then not exists (select 1 from public.jobs j where o.name = any (j.photos))
      when 'payment-proofs' then not exists (select 1 from public.payment_proofs p where p.image_path = o.name)
      when 'avatars' then exists (
        select 1 from public.profiles p
        where p.id = private.try_uuid((storage.foldername(o.name))[1]) and p.deleted_at is not null
      )
      else false
    end
  order by o.bucket_id, o.name
$$;
revoke execute on function public.storage_orphans(interval) from public, anon, authenticated;
grant execute on function public.storage_orphans(interval) to service_role;

-- ───────────────────────── SOS (pantalla 17) ─────────────────────────
alter table public.sos_alerts
  add column last_point extensions.geography(point, 4326),
  add column last_point_at timestamptz;
grant select (last_point, last_point_at) on public.sos_alerts to authenticated;
revoke insert, update on public.sos_alerts from authenticated;

-- La cuenta regresiva de 5 s ocurre en la app; al terminar se abre la alerta.
create function public.sos_open(p_job uuid default null, p_lat float8 default null, p_lng float8 default null)
returns public.sos_alerts
language plpgsql security definer set search_path = '' as $$
declare v public.sos_alerts;
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión' using errcode = '42501';
  end if;
  if p_job is not null and (select auth.uid()) not in (private.job_client_id(p_job), coalesce(private.job_assigned_pro_id(p_job), private.job_client_id(p_job))) then
    raise exception 'No participas en ese servicio' using errcode = '42501';
  end if;
  insert into public.sos_alerts (job_id, user_id, status, last_point, last_point_at)
  values (p_job, auth.uid(), 'open',
    case when p_lat is not null then extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography end,
    case when p_lat is not null then now() end)
  returning * into v;
  return v;
end $$;

-- Comparte ubicación cada 10 s mientras la alerta siga abierta.
create function public.sos_update_location(p_alert uuid, p_lat float8, p_lng float8) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.sos_alerts
  set last_point = extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography, last_point_at = now()
  where id = p_alert and user_id = (select auth.uid()) and status = 'open';
  if not found then
    raise exception 'La alerta ya no está abierta' using errcode = 'P0001';
  end if;
end $$;

-- Solo soporte cierra, con nota obligatoria.
create function public.sos_close(p_alert uuid, p_note text) returns public.sos_alerts
language plpgsql security definer set search_path = '' as $$
declare v public.sos_alerts;
begin
  if not public.is_staff() then
    raise exception 'Solo soporte cierra alertas SOS' using errcode = '42501';
  end if;
  if nullif(btrim(p_note), '') is null then
    raise exception 'Escribe una nota de cierre' using errcode = '22023';
  end if;
  update public.sos_alerts set status = 'closed', closed_at = now(), closed_by = auth.uid(), note = btrim(p_note)
  where id = p_alert and status = 'open' returning * into v;
  if not found then
    raise exception 'La alerta no está abierta' using errcode = 'P0001';
  end if;
  return v;
end $$;

-- Panel: alertas abiertas con quién la abrió, su teléfono, el servicio y la última posición.
create function public.sos_open_alerts()
returns table (
  id uuid, opened_at timestamptz, user_name text, user_phone text, job_id uuid, job_description text,
  latitude float8, longitude float8, last_point_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.opened_at, p.full_name, p.phone, a.job_id, j.description,
    extensions.st_y(a.last_point::extensions.geometry), extensions.st_x(a.last_point::extensions.geometry), a.last_point_at
  from public.sos_alerts a
  join public.profiles p on p.id = a.user_id
  left join public.jobs j on j.id = a.job_id
  where a.status = 'open' and public.is_staff()
  order by a.opened_at
$$;

grant execute on function public.sos_open(uuid, float8, float8), public.sos_update_location(uuid, float8, float8),
  public.sos_close(uuid, text), public.sos_open_alerts() to authenticated;
