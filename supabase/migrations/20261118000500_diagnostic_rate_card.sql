-- Corrección: la visita de diagnóstico no se podía publicar. El cliente ofrece la tarifa de visita
-- (diagnostic_visit_fee_cents, S/ 20), que es menor que el mínimo del tarifario de cada oficio
-- (S/ 30–35), y prepare_job lo rechazaba; la oferta del profesional chocaba igual con check_offer_rate.
-- Para un pedido con visita de diagnóstico, el piso es la tarifa de diagnóstico (check_diagnostic_price
-- ya lo exige al publicar) y la oferta va de esa tarifa al máximo del tarifario. La mano de obra real
-- se fija después con la reevaluación en el domicilio.

create or replace function private.prepare_job() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_unit public.pricing_unit;
  v_card public.trade_rate_cards;
begin
  select pricing_unit into v_unit from public.trades where id = new.trade_id;
  new.pricing_unit := coalesce(v_unit, 'job');
  if new.pricing_unit = 'job' then
    new.units := 1;
  end if;
  new.city_slug := private.active_city();
  new.currency_code := private.setting_text('currency_code', 'PEN');
  v_card := private.rate_card(new.trade_id, new.pricing_unit);
  if v_card.id is not null and not coalesce(new.diagnostic_visit, false)
     and new.offered_price_cents < v_card.min_cents * new.units then
    raise exception 'El precio mínimo sugerido es % céntimos por %', v_card.min_cents, new.pricing_unit using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function private.check_offer_rate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.jobs;
  v_card public.trade_rate_cards;
  v_min int;
begin
  select * into v_job from public.jobs where id = new.job_id;
  v_card := private.rate_card(v_job.trade_id, v_job.pricing_unit);
  if v_card.id is null then
    return new;
  end if;
  v_min := case when v_job.diagnostic_visit then private.setting_int('diagnostic_visit_fee_cents', 2000)
                else v_card.min_cents * v_job.units end;
  if new.price_cents < v_min or new.price_cents > v_card.max_cents * v_job.units then
    raise exception 'La oferta debe estar entre % y % céntimos (tarifario)', v_min, v_card.max_cents * v_job.units
      using errcode = 'P0001';
  end if;
  return new;
end $$;
