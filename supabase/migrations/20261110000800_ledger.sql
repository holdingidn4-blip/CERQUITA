-- Fase 7 · Comisión: libro de cuentas, constancias, pausa por deuda y calificaciones.
-- Reglas 1, 2, 3 y 9 de CLAUDE.md: céntimos, libro inmutable, sin compras en la app, parámetros en settings.

-- ───────────────────────── Parámetros nuevos ─────────────────────────
-- TODO(decidir): número, titular y cuenta de la empresa para Yape/Plin/transferencia (pantalla 15).
insert into public.settings (key, scope, value) values
  ('company_yape_number', 'global', '""'),
  ('company_plin_number', 'global', '""'),
  ('company_account_holder', 'global', '""'),
  ('company_bank_account', 'global', '""')
on conflict (key, scope) do nothing;

-- ───────────────────────── Escritura del libro ─────────────────────────
-- Núcleo interno (sin permisos para la API). La versión pública queda solo para el service role.
create function private.wallet_post(
  p_professional uuid, p_type public.wallet_entry_type, p_amount_cents int, p_idempotency_key text,
  p_job uuid default null, p_external_ref text default null, p_created_by uuid default null
) returns public.wallet_entries
language plpgsql security definer set search_path = '' as $$
declare v public.wallet_entries;
begin
  perform pg_advisory_xact_lock(hashtextextended('wallet:' || p_professional::text, 0));
  select * into v from public.wallet_entries where idempotency_key = p_idempotency_key;
  if found then
    if v.professional_id <> p_professional or v.amount_cents <> p_amount_cents or v.type <> p_type then
      raise exception 'idempotency_key % ya existe con otros datos', p_idempotency_key using errcode = '23505';
    end if;
    return v;
  end if;
  insert into public.wallet_entries (professional_id, job_id, type, amount_cents, external_ref, idempotency_key, created_by)
  values (p_professional, p_job, p_type, p_amount_cents, p_external_ref, p_idempotency_key, p_created_by)
  returning * into v;
  return v;
end $$;
revoke execute on function private.wallet_post from public, anon, authenticated;

create or replace function public.wallet_post_entry(
  p_professional uuid, p_type public.wallet_entry_type, p_amount_cents int, p_idempotency_key text,
  p_job uuid default null, p_external_ref text default null, p_created_by uuid default null
) returns public.wallet_entries
language sql security definer set search_path = '' as $$
  select private.wallet_post(p_professional, p_type, p_amount_cents, p_idempotency_key, p_job, p_external_ref, p_created_by)
$$;
revoke execute on function public.wallet_post_entry from public, anon, authenticated;
grant execute on function public.wallet_post_entry to service_role;

-- ───────────────────────── Comisión al confirmar ─────────────────────────
-- Regla de comisión 3: asiento commission_debit = precio × tasa congelada, clave job:<id>:commission.
-- Promoción de lanzamiento: los primeros N trabajos confirmados llevan un promo_credit por el mismo monto.
create function private.post_commission(p_job uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.jobs;
  v_pro uuid;
  v_amount int;
  v_done int;
begin
  select * into v from public.jobs where id = p_job;
  v_pro := private.job_assigned_pro_id(p_job);
  if v.status not in ('confirmed', 'rated') or v_pro is null then
    raise exception 'Solo se cobra comisión de trabajos confirmados' using errcode = 'P0001';
  end if;
  v_amount := private.commission_cents(v.final_price_cents, v.commission_rate_bps);
  if v_amount <= 0 then
    return;
  end if;
  perform private.wallet_post(v_pro, 'commission_debit', -v_amount, 'job:' || p_job || ':commission', p_job, p_job::text);
  select count(*) into v_done from public.wallet_entries
  where professional_id = v_pro and type = 'commission_debit' and job_id <> p_job;
  if v_done < private.setting_int('launch_promo_jobs', 0) then
    perform private.wallet_post(v_pro, 'promo_credit', v_amount, 'job:' || p_job || ':promo', p_job, 'promo de lanzamiento');
  end if;
end $$;

create or replace function public.confirm_job(p_job uuid, p_approve boolean default true) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare v public.jobs;
begin
  v := private.require_client(p_job);
  if v.status in ('confirmed', 'rated') and p_approve then
    perform private.post_commission(p_job); -- idempotente: no duplica el asiento
    return v;
  end if;
  perform private.require_status(v, 'finished');
  if not p_approve then
    update public.jobs set status = 'at_home', final_proposed_cents = null, finished_at = null
    where id = p_job returning * into v;
    return v;
  end if;
  update public.jobs set status = 'confirmed', confirmed_at = now(), final_price_cents = v.final_proposed_cents
  where id = p_job returning * into v;
  perform private.post_commission(p_job);
  return v;
end $$;

-- ───────────────────────── Deuda y pausa (regla de comisión 5 y 7) ─────────────────────────
create function private.pro_debt_at(p_pro uuid, p_now timestamptz)
returns table (
  balance_cents int, pending_cents int, limit_cents int, grace_days int,
  over_limit_since timestamptz, paused boolean, pay_to_reactivate_cents int
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_balance int;
  v_limit int := private.setting_int('debt_limit_cents', 3000);
  v_grace int := private.setting_int('grace_days', 3);
  v_since timestamptz;
begin
  select coalesce(sum(amount_cents), 0) into v_balance from public.wallet_entries where professional_id = p_pro;
  if -v_balance > v_limit then
    -- Desde cuándo está sobre el límite sin interrupción: primer asiento después del último que lo dejó bajo el límite.
    select min(e.created_at) into v_since from public.wallet_entries e
    where e.professional_id = p_pro
      and e.created_at > coalesce((
        select max(created_at) from public.wallet_entries
        where professional_id = p_pro and -balance_after_cents <= v_limit
      ), '-infinity');
  end if;
  return query select v_balance, greatest(0, -v_balance), v_limit, v_grace, v_since,
    coalesce(v_since <= p_now - make_interval(days => v_grace), false),
    greatest(0, -v_balance - v_limit);
end $$;

create function public.pro_debt(p_pro uuid default null)
returns table (
  balance_cents int, pending_cents int, limit_cents int, grace_days int,
  over_limit_since timestamptz, paused boolean, pay_to_reactivate_cents int
)
language plpgsql volatile security definer set search_path = '' as $$
declare v_pro uuid := coalesce(p_pro, (select auth.uid()));
begin
  if v_pro <> (select auth.uid()) and not public.is_staff() then
    raise exception 'Solo puedes ver tu propia comisión' using errcode = '42501';
  end if;
  -- clock_timestamp(): los asientos usan la hora real, no la del inicio de la transacción.
  return query select * from private.pro_debt_at(v_pro, clock_timestamp());
end $$;
grant execute on function public.pro_debt(uuid) to authenticated;

create function private.pro_is_paused(p_pro uuid) returns boolean
language sql volatile security definer set search_path = '' as $$
  select paused from private.pro_debt_at(p_pro, clock_timestamp())
$$;
grant execute on function private.pro_is_paused(uuid) to authenticated;

-- Pausado: no envía ofertas nuevas. Los servicios ya aceptados siguen (no se toca nada más).
drop policy "offers: crear si el pro es elegible" on public.offers;
create policy "offers: crear si el pro es elegible y no está en pausa" on public.offers for insert to authenticated
  with check (
    pro_id = (select auth.uid())
    and status = 'pending'
    and private.job_client_id(job_id) <> (select auth.uid())
    and private.job_status(job_id) in ('published', 'with_offers')
    and private.pro_is_eligible_for_job(job_id)
    and not private.pro_is_paused((select auth.uid()))
  );

-- ───────────────────────── Constancias (regla de comisión 6) ─────────────────────────
alter table public.payment_proofs add column review_note text check (char_length(review_note) <= 300);
alter table public.payment_proofs alter column professional_id set default auth.uid();
revoke update on public.payment_proofs from authenticated;
drop policy "proofs: soporte revisa" on public.payment_proofs;

create function public.review_payment_proof(p_proof uuid, p_approve boolean, p_note text default null)
returns public.payment_proofs
language plpgsql security definer set search_path = '' as $$
declare v public.payment_proofs;
begin
  if not public.is_staff() then
    raise exception 'Solo soporte revisa constancias' using errcode = '42501';
  end if;
  select * into v from public.payment_proofs where id = p_proof for update;
  if not found then
    raise exception 'Constancia no encontrada' using errcode = 'P0002';
  end if;
  if v.status <> 'pending' then
    raise exception 'Esta constancia ya fue revisada' using errcode = 'P0001';
  end if;
  if not p_approve and nullif(btrim(p_note), '') is null then
    raise exception 'Escribe el motivo del rechazo' using errcode = '22023';
  end if;
  update public.payment_proofs
  set status = case when p_approve then 'approved'::public.payment_proof_status else 'rejected' end,
      reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(btrim(p_note), '')
  where id = p_proof returning * into v;
  if p_approve then
    perform private.wallet_post(v.professional_id, 'payment_credit', v.amount_cents, 'proof:' || p_proof,
      null, v.method || ':' || v.operation_code, auth.uid());
  end if;
  return v;
end $$;
grant execute on function public.review_payment_proof(uuid, boolean, text) to authenticated;

-- ───────────────────────── Calificaciones (pantalla 6) ─────────────────────────
alter table public.ratings add column payment_method_used text
  check (payment_method_used in ('cash', 'yape', 'plin', 'transfer'));
grant insert (payment_method_used) on public.ratings to authenticated;
alter table public.ratings alter column from_id set default auth.uid();

-- La primera calificación del cliente deja el pedido en “Calificado”.
create function private.on_client_rated() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.jobs set status = 'rated'
  where id = new.job_id and client_id = new.from_id and status = 'confirmed';
  return new;
end $$;
create trigger on_client_rated after insert on public.ratings
  for each row execute function private.on_client_rated();

-- ───────────────────────── Parámetros: solo administradores ─────────────────────────
create function public.is_admin() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'staff_role', '') = 'admin'
$$;
grant execute on function public.is_admin() to authenticated;
drop policy "settings: soporte edita" on public.settings;
create policy "settings: solo admin edita" on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
