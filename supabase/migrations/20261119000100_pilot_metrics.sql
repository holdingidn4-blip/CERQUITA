-- Métricas del piloto para el panel: pedidos por día, tiempo a la primera oferta y % contratado.
-- Días en hora de Lima. Solo soporte (reviewer, support, admin).
-- Contratado = el pedido tuvo una oferta aceptada (aunque luego el pro no llegara o se cancelara).

create function public.pilot_metrics(p_days int default 14)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_days int := least(greatest(coalesce(p_days, 14), 1), 90);
  v_today date := (now() at time zone 'America/Lima')::date;
  v_from date := v_today - (v_days - 1);
  v_result jsonb;
begin
  if not public.is_staff() then
    raise exception 'solo soporte' using errcode = '42501';
  end if;

  with base as (
    select j.id, j.status, j.created_at,
      (j.created_at at time zone 'America/Lima')::date as day,
      (select min(o.created_at) from public.offers o where o.job_id = j.id) as first_offer_at,
      exists (
        select 1 from public.offers o where o.job_id = j.id and o.status in ('accepted', 'no_show')
      ) as hired
    from public.jobs j
    where j.created_at >= (v_from::timestamp at time zone 'America/Lima')
  ),
  timed as (
    select b.*, (extract(epoch from b.first_offer_at - b.created_at) / 60)::float8 as first_offer_min
    from base b
  ),
  per_day as (
    select d.day::date as day,
      count(t.id)::int as published,
      count(t.first_offer_at)::int as with_offer,
      (count(*) filter (where t.hired))::int as hired,
      (count(*) filter (where t.status in ('confirmed', 'rated')))::int as completed,
      (count(*) filter (where t.status = 'cancelled'))::int as cancelled,
      round((percentile_cont(0.5) within group (order by t.first_offer_min))::numeric, 1) as median_first_offer_min
    from generate_series(v_from, v_today, interval '1 day') as d (day)
    left join timed t on t.day = d.day::date
    group by d.day
  ),
  totals as (
    select count(*)::int as published,
      count(first_offer_at)::int as with_offer,
      (count(*) filter (where hired))::int as hired,
      (count(*) filter (where status in ('confirmed', 'rated')))::int as completed,
      (count(*) filter (where status = 'cancelled'))::int as cancelled,
      round((percentile_cont(0.5) within group (order by first_offer_min))::numeric, 1) as median_first_offer_min,
      round((percentile_cont(0.9) within group (order by first_offer_min))::numeric, 1) as p90_first_offer_min
    from timed
  )
  select jsonb_build_object(
    'days', v_days,
    'from', v_from,
    'to', v_today,
    'totals', (select to_jsonb(t) from totals t),
    'daily', (select jsonb_agg(to_jsonb(p) order by p.day) from per_day p)
  ) into v_result;

  return v_result;
end $$;

revoke execute on function public.pilot_metrics(int) from public, anon;
grant execute on function public.pilot_metrics(int) to authenticated;
