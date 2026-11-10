-- Fase 5 · Pedidos y ofertas.
-- Lecturas por funciones que devuelven solo lo necesario: distancias redondeadas,
-- nunca coordenadas del profesional ni la dirección exacta (reglas 4, 5 y 7).

-- ───────────────────────── Utilidades ─────────────────────────
-- Comisión en céntimos, redondeo a favor del profesional en empates (mitad hacia abajo).
-- La fase 7 la usará al confirmar; la app muestra el mismo cálculo (packages/shared/money.ts).
create function private.commission_cents(p_price_cents int, p_rate_bps int) returns int
language sql immutable set search_path = '' as $$
  select ((p_price_cents::bigint * p_rate_bps + 4999) / 10000)::int
$$;

-- Distancia redondeada a 50 m (no permite triangular la posición exacta).
create function private.round_distance(p_m float8) returns int
language sql immutable set search_path = '' as $$
  select (greatest(50, round(p_m / 50.0) * 50))::int
$$;

-- "Carlos Mendoza" → "Carlos M."
create function private.short_name(p_full text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_full is null or btrim(p_full) = '' then 'Usuario'
    when array_length(regexp_split_to_array(btrim(p_full), '\s+'), 1) = 1 then btrim(p_full)
    else split_part(btrim(p_full), ' ', 1) || ' ' ||
      upper(left((regexp_split_to_array(btrim(p_full), '\s+'))[array_length(regexp_split_to_array(btrim(p_full), '\s+'), 1)], 1)) || '.'
  end
$$;

create function private.rating_avg(p_user uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select round(avg(stars)::numeric, 1) from public.ratings where to_id = p_user
$$;

create function private.jobs_done(p_pro uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.jobs j
  join public.offers o on o.id = j.accepted_offer_id
  where o.pro_id = p_pro and j.status in ('confirmed', 'rated')
$$;

-- ───────────────────────── Cliente: inicio y nuevo pedido ─────────────────────────
-- Profesionales en línea cerca de un punto, por oficio. Solo conteos y la distancia mínima.
create function public.nearby_pros_summary(p_point extensions.geography, p_radius_m int default 3000)
returns table (trade_id smallint, pros int, nearest_m int)
language sql stable security definer set search_path = '' as $$
  select pt.trade_id, count(distinct pt.pro_id)::int,
    private.round_distance(min(extensions.st_distance(pp.last_point, p_point)))
  from public.pro_trades pt
  join public.pro_presence pp on pp.pro_id = pt.pro_id
  where (select auth.uid()) is not null
    and pt.status in ('approved_observation', 'approved_full')
    and pp.online and pp.last_point is not null
    and pt.pro_id <> (select auth.uid())
    and extensions.st_dwithin(pp.last_point, p_point, least(greatest(p_radius_m, 500), 20000))
  group by pt.trade_id
$$;
grant execute on function public.nearby_pros_summary(extensions.geography, int) to authenticated;

-- Rango habitual de precio (percentiles 25 y 75, en soles enteros). Null si hay menos de 5 pedidos.
create function public.price_hint(p_trade smallint)
returns table (low_cents int, high_cents int, samples int)
language sql stable security definer set search_path = '' as $$
  with recent as (
    select offered_price_cents::float8 as price from public.jobs
    where trade_id = p_trade and created_at > now() - interval '90 days' and status <> 'cancelled'
  )
  select (round(percentile_cont(0.25) within group (order by price) / 100) * 100)::int,
    (round(percentile_cont(0.75) within group (order by price) / 100) * 100)::int,
    count(*)::int
  from recent
  having count(*) >= 5 and (select auth.uid()) is not null
$$;
grant execute on function public.price_hint(smallint) to authenticated;

-- ───────────────────────── Profesional: solicitudes cercanas (pantalla 7) ─────────────────────────
create function public.nearby_jobs()
returns table (
  id uuid, trade_id smallint, trade_name text, description text, photos text[],
  offered_price_cents int, distance_m int, created_at timestamptz,
  client_name text, client_rating numeric, my_offer_id uuid, my_offer_status public.offer_status,
  my_offer_price_cents int
)
language sql stable security definer set search_path = '' as $$
  select j.id, j.trade_id, t.name, j.description, j.photos, j.offered_price_cents,
    private.round_distance(extensions.st_distance(pp.last_point, j.approx_point)),
    j.created_at, private.short_name(p.full_name), private.rating_avg(j.client_id),
    o.id, o.status, o.price_cents
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

-- ───────────────────────── Cliente: ofertas recibidas (pantalla 3) ─────────────────────────
create function public.job_offers(p_job uuid)
returns table (
  id uuid, pro_id uuid, price_cents int, message text, status public.offer_status, created_at timestamptz,
  pro_name text, avatar_url text, rating_avg numeric, jobs_done int, distance_m int
)
language sql stable security definer set search_path = '' as $$
  select o.id, o.pro_id, o.price_cents, o.message, o.status, o.created_at,
    private.short_name(p.full_name), p.avatar_url, private.rating_avg(o.pro_id), private.jobs_done(o.pro_id),
    case when pp.last_point is not null
      then private.round_distance(extensions.st_distance(pp.last_point, j.approx_point)) end
  from public.offers o
  join public.jobs j on j.id = o.job_id
  join public.profiles p on p.id = o.pro_id
  left join public.pro_presence pp on pp.pro_id = o.pro_id
  where o.job_id = p_job and j.client_id = (select auth.uid()) and o.status in ('pending', 'accepted')
  order by o.price_cents, o.created_at
$$;
grant execute on function public.job_offers(uuid) to authenticated;

-- ───────────────────────── Perfil público del profesional (pantalla 4) ─────────────────────────
create function public.pro_profile(p_pro uuid)
returns table (
  id uuid, full_name text, avatar_url text, trades text[], identity_verified boolean,
  rating_avg numeric, ratings_count int, jobs_done int,
  review_stars smallint, review_comment text, review_author text
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
    r.stars, r.comment, private.short_name(rp.full_name)
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
grant execute on function public.pro_profile(uuid) to authenticated;

-- ───────────────────────── Aceptar una oferta ─────────────────────────
-- Congela precio y tasa (regla de comisión 1). Atómico: bloquea el pedido.
create function public.accept_offer(p_offer uuid) returns public.jobs
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
      commission_rate_bps = private.setting_int('commission_rate_bps', 1000)
  where id = v_job.id
  returning * into v_job;
  return v_job;
end $$;
grant execute on function public.accept_offer(uuid) to authenticated;

-- El cliente solo puede editar precio y descripción, o cancelar, mientras no haya aceptado.
-- Si cancela, las ofertas pendientes vencen.
create function private.on_job_cancelled() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.offers set status = 'expired' where job_id = new.id and status = 'pending';
  return new;
end $$;
create trigger on_job_cancelled after update of status on public.jobs
  for each row when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function private.on_job_cancelled();

-- Una oferta retirada no cuenta: si no quedan pendientes, el pedido vuelve a "Publicado".
create function private.on_offer_withdrawn() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.jobs set status = 'published'
  where id = new.job_id and status = 'with_offers'
    and not exists (select 1 from public.offers where job_id = new.job_id and status = 'pending');
  return new;
end $$;
create trigger on_offer_withdrawn after update of status on public.offers
  for each row when (new.status = 'withdrawn' and old.status = 'pending')
  execute function private.on_offer_withdrawn();

-- Fotos del pedido: el cliente las agrega solo dentro de la carpeta del pedido.
create function private.guard_job_photos() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.is_api_user() and exists (
    select 1 from unnest(new.photos) p where p not like new.id::text || '/%'
  ) then
    raise exception 'Las fotos deben estar en la carpeta del pedido' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_job_photos before insert or update of photos on public.jobs
  for each row execute function private.guard_job_photos();

grant execute on function private.commission_cents(int, int) to authenticated;
grant execute on function private.round_distance(float8) to authenticated;
grant execute on function private.short_name(text) to authenticated;
