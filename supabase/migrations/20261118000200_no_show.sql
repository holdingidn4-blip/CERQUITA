-- "El profesional no llega" (como en las apps de taxi):
-- 1. En su oferta, el profesional indica en cuántos minutos llega.
-- 2. Al aceptar, se fija la llegada acordada: ahora + esos minutos, o la hora programada.
-- 3. Si pasa la tolerancia y no llegó, el cliente cambia de profesional: el pedido vuelve a las
--    otras ofertas (o queda publicado) y al profesional se le registra una llegada incumplida.
-- 4. Con N llegadas incumplidas en la ventana, sus ofertas nuevas se pausan. La pausa se levanta
--    sola cuando las faltas salen de la ventana.
-- El profesional nuevo no ve el chat ni el GPS del anterior. Los parámetros viven en settings.

-- ───────── Parámetros ─────────
insert into public.settings (key, scope, value) values
  ('no_show_grace_minutes', 'global', '15'),
  ('no_show_strikes', 'global', '3'),
  ('no_show_window_days', 'global', '30'),
  ('default_eta_minutes', 'global', '60')
on conflict (key, scope) do nothing;

-- ───────── Columnas ─────────
alter table public.offers add column eta_minutes smallint check (eta_minutes between 5 and 240);
grant insert (eta_minutes), update (eta_minutes) on public.offers to authenticated;

alter table public.jobs
  add column assigned_at timestamptz,
  add column promised_arrival_at timestamptz;
grant select (assigned_at, promised_arrival_at) on public.jobs to authenticated;

-- ───────── Llegadas incumplidas ─────────
create table public.pro_no_shows (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  pro_id uuid not null references public.profiles (id) on delete cascade,
  offer_id uuid not null unique references public.offers (id) on delete cascade,
  promised_arrival_at timestamptz not null,
  reported_at timestamptz not null default now()
);
create index on public.pro_no_shows (pro_id, reported_at desc);
alter table public.pro_no_shows enable row level security;
grant select on public.pro_no_shows to authenticated;
create policy "faltas: el propio profesional o soporte" on public.pro_no_shows for select to authenticated
  using (pro_id = (select auth.uid()) or public.is_staff());

create function private.job_assigned_at(p_job uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select assigned_at from public.jobs where id = p_job
$$;

create function private.no_show_count(p_pro uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.pro_no_shows
  where pro_id = p_pro
    and reported_at > now() - make_interval(days => private.setting_int('no_show_window_days', 30))
$$;

create function private.pro_is_no_show_paused(p_pro uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.no_show_count(p_pro) >= private.setting_int('no_show_strikes', 3)
$$;

grant execute on function private.job_assigned_at(uuid), private.no_show_count(uuid),
  private.pro_is_no_show_paused(uuid) to authenticated;

-- ───────── Aceptar: fija la asignación y la llegada acordada ─────────
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
      commission_rate_bps = private.setting_int('commission_rate_bps', 1000),
      assigned_at = now(),
      promised_arrival_at = case
        when v_job.scheduled_for is null
          then now() + make_interval(mins => coalesce(v_offer.eta_minutes, private.setting_int('default_eta_minutes', 60)))
        else greatest(v_job.scheduled_for, now() + make_interval(mins => coalesce(v_offer.eta_minutes, 0)))
      end
  where id = v_job.id
  returning * into v_job;
  return v_job;
end $$;

-- ───────── Cambiar de profesional cuando no llegó ─────────
create function public.report_no_show(p_job uuid) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare
  v public.jobs;
  v_offer public.offers;
  v_trade text;
begin
  select * into v from public.jobs where id = p_job for update;
  if not found or v.client_id <> (select auth.uid()) then
    raise exception 'Solo quien hizo el pedido puede cambiar de profesional' using errcode = '42501';
  end if;
  perform private.require_status(v, 'accepted', 'on_the_way');
  if v.promised_arrival_at is null
     or now() < v.promised_arrival_at + make_interval(mins => private.setting_int('no_show_grace_minutes', 15)) then
    raise exception 'Todavía está dentro del tiempo de llegada acordado' using errcode = 'P0001';
  end if;
  select * into v_offer from public.offers where id = v.accepted_offer_id;

  insert into public.pro_no_shows (job_id, pro_id, offer_id, promised_arrival_at)
  values (v.id, v_offer.pro_id, v_offer.id, v.promised_arrival_at);
  update public.offers set status = 'no_show' where id = v_offer.id;

  -- Las ofertas que rechazó la aceptación vuelven a estar en pie (salvo pros en pausa o bloqueados).
  update public.offers o set status = 'pending'
  where o.job_id = v.id and o.status = 'rejected'
    and not private.pro_is_paused(o.pro_id)
    and not private.pro_is_no_show_paused(o.pro_id)
    and not private.is_blocked(o.pro_id, v.client_id);

  update public.jobs set
    status = case when exists (select 1 from public.offers where job_id = v.id and status = 'pending')
                  then 'with_offers'::public.job_status else 'published'::public.job_status end,
    accepted_offer_id = null, final_price_cents = null, labor_cents = null, materials_cents = 0,
    materials_provided_by = 'client', commission_rate_bps = null, security_code = null,
    started_at = null, assigned_at = null, promised_arrival_at = null
  where id = v.id
  returning * into v;

  perform private.notify(v_offer.pro_id, 'job_no_show', 'El cliente cambió de profesional',
    'No llegaste en el tiempo acordado. Se registró una llegada incumplida.',
    jsonb_build_object('url', '/solicitudes', 'job_id', v.id));
  insert into public.notification_outbox (user_id, kind, title, body, data)
  select o.pro_id, 'offer_reopened', 'Tu oferta vuelve a estar en pie',
    'El cliente está eligiendo otro profesional para su pedido.',
    jsonb_build_object('url', '/solicitudes', 'job_id', v.id)
  from public.offers o where o.job_id = v.id and o.status = 'pending';
  -- Sin ofertas en pie: se avisa otra vez a los profesionales cercanos (menos al que faltó).
  if v.status = 'published' then
    select name into v_trade from public.trades where id = v.trade_id;
    insert into public.notification_outbox (user_id, kind, title, body, data)
    select distinct pt.pro_id, 'job_nearby', 'Pedido disponible otra vez: ' || v_trade,
      left(v.description, 80) || ' · ' || private.round_distance(extensions.st_distance(pp.last_point, v.approx_point)) || ' m',
      jsonb_build_object('url', '/solicitudes/' || v.id || '/cotizar', 'job_id', v.id)
    from public.pro_trades pt
    join public.pro_presence pp on pp.pro_id = pt.pro_id
    join public.profiles pr on pr.id = pt.pro_id and pr.deleted_at is null and pr.suspended_at is null
    where pt.trade_id = v.trade_id and pt.status in ('approved_observation', 'approved_full')
      and pp.online and pp.last_point is not null and pt.pro_id not in (v.client_id, v_offer.pro_id)
      and extensions.st_dwithin(pp.last_point, v.approx_point, pp.radius_m)
      and not private.is_blocked(pt.pro_id, v.client_id);
  end if;
  return v;
end $$;
grant execute on function public.report_no_show(uuid) to authenticated;

-- Para el aviso del profesional: cuántas llegadas incumplidas tiene y si está en pausa.
create function public.my_reliability()
returns table (no_shows int, strikes_limit int, window_days int, paused boolean)
language sql stable security definer set search_path = '' as $$
  select private.no_show_count((select auth.uid())), private.setting_int('no_show_strikes', 3),
    private.setting_int('no_show_window_days', 30), private.pro_is_no_show_paused((select auth.uid()))
$$;
grant execute on function public.my_reliability() to authenticated;

-- ───────── Ofertas: con hora de llegada; el cliente la ve al comparar ─────────
drop function public.job_offers(uuid);
create function public.job_offers(p_job uuid)
returns table (
  id uuid, pro_id uuid, price_cents int, message text, status public.offer_status, created_at timestamptz,
  pro_name text, avatar_url text, rating_avg numeric, jobs_done int, distance_m int, eta_minutes smallint
)
language sql stable security definer set search_path = '' as $$
  select o.id, o.pro_id, o.price_cents, o.message, o.status, o.created_at,
    private.short_name(p.full_name), p.avatar_url, private.rating_avg(o.pro_id), private.jobs_done(o.pro_id),
    case when pp.last_point is not null
      then private.round_distance(extensions.st_distance(pp.last_point, j.approx_point)) end,
    o.eta_minutes
  from public.offers o
  join public.jobs j on j.id = o.job_id
  join public.profiles p on p.id = o.pro_id
  left join public.pro_presence pp on pp.pro_id = o.pro_id
  where o.job_id = p_job and j.client_id = (select auth.uid()) and o.status in ('pending', 'accepted')
  order by o.price_cents, o.created_at
$$;
grant execute on function public.job_offers(uuid) to authenticated;

-- El profesional que faltó ya no ve ese pedido en sus solicitudes.
create or replace function public.nearby_jobs()
returns table (
  id uuid, trade_id smallint, trade_name text, description text, photos text[],
  offered_price_cents int, distance_m int, created_at timestamptz,
  client_name text, client_rating numeric, my_offer_id uuid, my_offer_status public.offer_status,
  my_offer_price_cents int, pricing_unit public.pricing_unit, units smallint, currency_code char(3),
  video_path text, video_seconds smallint, video_expires_at timestamptz, diagnostic_visit boolean, caution boolean,
  schedule_kind text, scheduled_for timestamptz
)
language sql stable security definer set search_path = '' as $$
  select j.id, j.trade_id, t.name, j.description, j.photos, j.offered_price_cents,
    private.round_distance(extensions.st_distance(pp.last_point, j.approx_point)),
    j.created_at, private.short_name(p.full_name), private.rating_avg(j.client_id),
    o.id, o.status, o.price_cents, j.pricing_unit, j.units, j.currency_code,
    case when j.video_uploaded_at > now() - make_interval(hours => private.setting_int('temp_media_hours', 48)) then j.video_path end,
    j.video_seconds,
    j.video_uploaded_at + make_interval(hours => private.setting_int('temp_media_hours', 48)),
    j.diagnostic_visit, private.location_caution(j.approx_point), j.schedule_kind, j.scheduled_for
  from public.jobs j
  join public.trades t on t.id = j.trade_id
  join public.profiles p on p.id = j.client_id
  join public.pro_presence pp on pp.pro_id = (select auth.uid())
  left join public.offers o on o.job_id = j.id and o.pro_id = (select auth.uid())
  where j.status in ('published', 'with_offers')
    and j.client_id <> (select auth.uid())
    and private.pro_is_eligible(j.trade_id, j.approx_point)
    and not private.is_blocked((select auth.uid()), j.client_id)
    and (o.status is null or o.status <> 'no_show')
  order by 7, j.created_at desc
$$;

-- ───────── Políticas ─────────
drop policy "offers: crear si el pro es elegible, sin pausa ni bloqueo" on public.offers;
create policy "offers: crear si el pro es elegible, sin pausas ni bloqueo" on public.offers for insert to authenticated
  with check (
    pro_id = (select auth.uid())
    and status = 'pending'
    and private.job_client_id(job_id) <> (select auth.uid())
    and private.job_status(job_id) in ('published', 'with_offers')
    and private.pro_is_eligible_for_job(job_id)
    and not private.pro_is_paused((select auth.uid()))
    and not private.pro_is_no_show_paused((select auth.uid()))
    and not private.is_blocked((select auth.uid()), private.job_client_id(job_id))
  );

-- El profesional asignado ve solo lo de su asignación: ni el chat ni el GPS del que faltó.
drop policy "chat: leer participantes" on public.job_messages;
create policy "chat: leer participantes" on public.job_messages for select to authenticated
  using (
    (select auth.uid()) = private.job_client_id(job_id)
    or ((select auth.uid()) = private.job_assigned_pro_id(job_id)
        and created_at >= coalesce(private.job_assigned_at(job_id), '-infinity'::timestamptz))
    or public.is_staff()
  );
drop policy "tracks: leer participantes" on public.job_tracks;
create policy "tracks: leer participantes" on public.job_tracks for select to authenticated
  using (
    private.job_client_id(job_id) = (select auth.uid())
    or (private.job_assigned_pro_id(job_id) = (select auth.uid())
        and recorded_at >= coalesce(private.job_assigned_at(job_id), '-infinity'::timestamptz))
    or public.is_staff()
  );
