-- Fase 4 · Registro y verificación por oficio.
-- Envío y revisión solo por funciones del servidor, que validan la evidencia.

-- ───────────────────────── Parámetros (regla 9) ─────────────────────────
-- Valores iniciales en la migración para que existan también en producción.
insert into public.settings (key, scope, value) values
  ('commission_rate_bps', 'global', '1000'),
  ('debt_limit_cents', 'global', '3000'),
  ('grace_days', 'global', '3'),
  -- TODO(decidir): trabajos sin comisión de la promoción de lanzamiento.
  ('launch_promo_jobs', 'global', '0'),
  ('full_approval_ratings', 'global', '3'),
  ('full_approval_min_stars', 'global', '4'),
  ('min_trade_evidence', 'global', '2'),
  ('reject_retry_days', 'global', '30')
on conflict (key, scope) do nothing;

create function private.setting_int(p_key text, p_default int) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::int from public.settings where key = p_key and scope = 'global'), p_default)
$$;

-- ───────────────────────── Catálogo ─────────────────────────
-- Nombre del oficio en persona ("Gasfitero") para las pantallas del profesional.
alter table public.trades add column pro_name text;
update public.trades set pro_name = case slug
  when 'gasfiteria' then 'Gasfitero'
  when 'electricidad' then 'Electricista'
  when 'carpinteria' then 'Carpintero'
  when 'pintura' then 'Pintor'
  when 'hogar' then 'Hogar'
  else name end;
alter table public.trades alter column pro_name set not null;
alter table public.trades alter column pro_name set default '';
insert into public.trades (slug, name, pro_name) values
  ('gasfiteria', 'Gasfitería', 'Gasfitero'),
  ('electricidad', 'Electricidad', 'Electricista'),
  ('carpinteria', 'Carpintería', 'Carpintero'),
  ('pintura', 'Pintura', 'Pintor'),
  ('hogar', 'Hogar', 'Hogar')
on conflict (slug) do nothing;

-- ───────────────────────── pro_trades: el pro ya no cambia el estado directo ─────────────────────────
create or replace function private.guard_pro_trade() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not private.is_api_user() then
    return new;
  end if;
  if new.status is distinct from old.status
     or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at
     or new.reason is distinct from old.reason
     or new.good_ratings_count is distinct from old.good_ratings_count then
    raise exception 'Usa submit_pro_trade() o review_pro_trade()' using errcode = '42501';
  end if;
  return new;
end $$;

revoke update on public.pro_trades from authenticated;
drop policy "pro_trades: editar propios" on public.pro_trades;
drop policy "pro_trades: soporte revisa" on public.pro_trades;
drop policy "pro_trades: crear propios" on public.pro_trades;
alter table public.pro_trades alter column pro_id set default auth.uid();
create policy "pro_trades: crear borrador propio" on public.pro_trades for insert to authenticated
  with check (pro_id = (select auth.uid()) and status = 'draft');

-- El pro puede quitar un oficio mientras sea borrador (sus evidencias se borran en cascada).
grant delete on public.pro_trades to authenticated;
create policy "pro_trades: borrar borrador propio" on public.pro_trades for delete to authenticated
  using (pro_id = (select auth.uid()) and status = 'draft');

-- ───────────────────────── Requisitos ─────────────────────────
-- Faltantes para enviar o aprobar un oficio: identidad completa + N evidencias del oficio.
create function private.pro_trade_missing(p_pro_trade uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  with pt as (select id, pro_id from public.pro_trades where id = p_pro_trade),
  identity_kinds(kind) as (
    values ('dni_front'::public.verification_document_kind), ('dni_back'), ('selfie'), ('background')
  ),
  missing_identity as (
    select ik.kind::text from identity_kinds ik, pt
    where not exists (
      select 1 from public.verification_documents d
      where d.pro_id = pt.pro_id and d.kind = ik.kind and d.pro_trade_id is null
    )
  ),
  evidence as (
    select count(*) as n from public.verification_documents d, pt
    where d.pro_trade_id = pt.id and d.kind in ('work_photo', 'certificate', 'reference', 'quiz')
  )
  select coalesce(array_agg(kind order by kind), '{}') ||
    case when (select n from evidence) < private.setting_int('min_trade_evidence', 2)
      then array['evidence'] else '{}'::text[] end
  from missing_identity
$$;

create function public.pro_trade_missing(p_pro_trade uuid) returns text[]
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.pro_trades where id = p_pro_trade and (pro_id = (select auth.uid()) or public.is_staff())
  ) then
    raise exception 'Oficio no encontrado' using errcode = 'P0002';
  end if;
  return private.pro_trade_missing(p_pro_trade);
end $$;
grant execute on function public.pro_trade_missing(uuid) to authenticated;

-- ───────────────────────── Envío (profesional) ─────────────────────────
create function public.submit_pro_trade(p_pro_trade uuid) returns public.pro_trades
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
    raise exception 'Falta evidencia: %', array_to_string(v_missing, ', ') using errcode = 'P0001';
  end if;
  update public.pro_trades set status = 'submitted' where id = p_pro_trade returning * into v;
  return v;
end $$;
grant execute on function public.submit_pro_trade(uuid) to authenticated;

-- ───────────────────────── Revisión (soporte) ─────────────────────────
create function public.review_pro_trade(p_pro_trade uuid, p_decision text, p_reason text default null)
returns public.pro_trades
language plpgsql security definer set search_path = '' as $$
declare
  v public.pro_trades;
  v_reason text := nullif(btrim(p_reason), '');
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

  case p_decision
    when 'approve' then
      if cardinality(private.pro_trade_missing(p_pro_trade)) > 0 then
        raise exception 'Regla: identidad + al menos dos evidencias' using errcode = 'P0001';
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
    raise exception 'El motivo es obligatorio para pedir datos o rechazar' using errcode = '22023';
  end if;

  update public.pro_trades
  set status = v_status, reviewed_by = auth.uid(), reviewed_at = now(),
      reason = v_reason, good_ratings_count = case when v_status = 'approved_observation' then 0 else good_ratings_count end
  where id = p_pro_trade
  returning * into v;
  return v;
end $$;
grant execute on function public.review_pro_trade(uuid, text, text) to authenticated;

-- ───────────────────────── En observación → pleno ─────────────────────────
create function private.on_rating_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_trade smallint;
begin
  if new.stars < private.setting_int('full_approval_min_stars', 4) then
    return new;
  end if;
  -- Solo cuenta la calificación del cliente al profesional asignado.
  select j.trade_id into v_trade from public.jobs j
  where j.id = new.job_id and j.client_id = new.from_id and private.job_assigned_pro_id(j.id) = new.to_id;
  if v_trade is null then
    return new;
  end if;
  update public.pro_trades
  set good_ratings_count = good_ratings_count + 1,
      status = case when good_ratings_count + 1 >= private.setting_int('full_approval_ratings', 3)
        then 'approved_full'::public.pro_trade_status else status end
  where pro_id = new.to_id and trade_id = v_trade and status = 'approved_observation';
  return new;
end $$;
create trigger on_rating_created after insert on public.ratings
  for each row execute function private.on_rating_created();

-- ───────────────────────── Resumen para la pantalla 12 ─────────────────────────
-- Identidad verificada = algún oficio aprobado alguna vez (aprobar exige revisar la identidad).
create function public.my_verification()
returns table (identity_verified boolean, identity_missing text[])
language sql stable security definer set search_path = '' as $$
  select
    exists (
      select 1 from public.pro_trades
      where pro_id = (select auth.uid()) and reviewed_at is not null
        and status in ('approved_observation', 'approved_full', 'suspended')
    ),
    coalesce((
      select array_agg(k::text order by k::text)
      from unnest(array['dni_front', 'dni_back', 'selfie', 'background']::public.verification_document_kind[]) k
      where not exists (
        select 1 from public.verification_documents d
        where d.pro_id = (select auth.uid()) and d.kind = k and d.pro_trade_id is null
      )
    ), '{}')
$$;
grant execute on function public.my_verification() to authenticated;
