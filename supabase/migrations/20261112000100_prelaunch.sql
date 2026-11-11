-- Pre-lanzamiento: notificaciones push, reportar/bloquear, soporte, programación de pedidos,
-- suspensión manual, reversión de asientos, datos de pago de la empresa y anti-abuso de SMS.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ═════════════════════════ 1. Notificaciones push ═════════════════════════
create table public.push_tokens (
  token text primary key check (token ~ '^(ExponentPushToken|ExpoPushToken)\[.+\]$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now()
);
create index on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
grant select, delete on public.push_tokens to authenticated;
create policy "push: los propios" on public.push_tokens for select to authenticated using (user_id = (select auth.uid()));
create policy "push: borrar los propios" on public.push_tokens for delete to authenticated using (user_id = (select auth.uid()));

create function public.register_push_token(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión' using errcode = '42501';
  end if;
  insert into public.push_tokens (token, user_id, platform) values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end $$;
grant execute on function public.register_push_token(text, text) to authenticated;

-- Bandeja de salida: los triggers encolan y la Edge Function send-push envía (Expo Push API).
create table public.notification_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts smallint not null default 0,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index on public.notification_outbox (status, created_at) where status = 'pending';
alter table public.notification_outbox enable row level security;
-- Sin políticas: solo el servidor (service role / funciones) la usa.

create function private.notify(p_user uuid, p_kind text, p_title text, p_body text, p_data jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.notification_outbox (user_id, kind, title, body, data)
  select p_user, p_kind, p_title, p_body, p_data where p_user is not null
$$;

-- a) Pedido nuevo → profesionales cercanos con el oficio aprobado (PostGIS, mismo criterio que el reparto).
create function private.on_job_published_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_trade text;
begin
  select name into v_trade from public.trades where id = new.trade_id;
  insert into public.notification_outbox (user_id, kind, title, body, data)
  select distinct pt.pro_id, 'job_nearby', 'Nuevo pedido cerca: ' || v_trade,
    left(new.description, 80) || ' · ' || private.round_distance(extensions.st_distance(pp.last_point, new.approx_point)) || ' m',
    jsonb_build_object('url', '/solicitudes/' || new.id || '/cotizar', 'job_id', new.id)
  from public.pro_trades pt
  join public.pro_presence pp on pp.pro_id = pt.pro_id
  join public.profiles pr on pr.id = pt.pro_id and pr.deleted_at is null and pr.suspended_at is null
  where pt.trade_id = new.trade_id and pt.status in ('approved_observation', 'approved_full')
    and pp.online and pp.last_point is not null and pt.pro_id <> new.client_id
    and extensions.st_dwithin(pp.last_point, new.approx_point, pp.radius_m)
    and not private.is_blocked(pt.pro_id, new.client_id);
  return new;
end $$;

-- b) Oferta nueva → cliente.
create function private.on_offer_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify(private.job_client_id(new.job_id), 'offer_new', 'Tienes una oferta nueva',
    private.short_name((select full_name from public.profiles where id = new.pro_id)) || ' ofrece S/ ' ||
      to_char(new.price_cents / 100.0, 'FM999990.00'),
    jsonb_build_object('url', '/pedido/' || new.job_id || '/ofertas', 'job_id', new.job_id));
  return new;
end $$;

-- c) Mensaje nuevo → la otra parte.
create function private.on_message_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_to uuid;
begin
  v_to := case when new.sender_id = private.job_client_id(new.job_id) then private.job_assigned_pro_id(new.job_id)
               else private.job_client_id(new.job_id) end;
  perform private.notify(v_to, 'chat_message',
    private.short_name((select full_name from public.profiles where id = new.sender_id)),
    left(new.body, 120), jsonb_build_object('url', '/chat/' || new.job_id, 'job_id', new.job_id));
  return new;
end $$;

-- d) Cambios de estado y reevaluación.
create function private.on_job_status_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_pro uuid := private.job_assigned_pro_id(new.id);
  v_client_url text := '/servicio/' || new.id;
  v_pro_url text := '/trabajo/' || new.id;
begin
  if new.status is distinct from old.status then
    case new.status
      when 'accepted' then perform private.notify(v_pro, 'job_accepted', '¡Aceptaron tu oferta!', 'Revisa la dirección y ve al domicilio.', jsonb_build_object('url', v_pro_url, 'job_id', new.id));
      when 'on_the_way' then perform private.notify(new.client_id, 'job_on_the_way', 'Tu profesional va en camino', 'Sigue su llegada y ten listo tu código de seguridad.', jsonb_build_object('url', v_client_url, 'job_id', new.id));
      when 'at_home' then perform private.notify(new.client_id, 'job_arrived', 'Tu profesional llegó', 'Ya está en tu domicilio.', jsonb_build_object('url', v_client_url, 'job_id', new.id));
      when 'price_renegotiated' then perform private.notify(v_pro, 'job_renegotiated', 'El cliente aprobó la reevaluación', 'Puedes continuar con el trabajo.', jsonb_build_object('url', v_pro_url, 'job_id', new.id));
      when 'finished' then perform private.notify(new.client_id, 'job_finished', 'Trabajo terminado', 'Confirma el monto final en la app.', jsonb_build_object('url', v_client_url || '/confirmar', 'job_id', new.id));
      when 'confirmed' then perform private.notify(v_pro, 'job_confirmed', 'Trabajo confirmado', 'El cliente confirmó el monto. ¡Buen trabajo!', jsonb_build_object('url', v_pro_url, 'job_id', new.id));
      when 'cancelled' then
        if v_pro is not null then
          perform private.notify(case when new.cancelled_by = new.client_id then v_pro else new.client_id end,
            'job_cancelled', 'Servicio cancelado', coalesce(new.cancel_reason, 'El servicio fue cancelado.'),
            jsonb_build_object('url', case when new.cancelled_by = new.client_id then v_pro_url else v_client_url end, 'job_id', new.id));
        end if;
      else null;
    end case;
  end if;
  if new.reeval_proposed_at is not null and new.reeval_proposed_at is distinct from old.reeval_proposed_at then
    perform private.notify(new.client_id, 'job_reevaluated', 'Tu profesional reevaluó el trabajo',
      'Revisa el desglose y apruébalo o recházalo.', jsonb_build_object('url', v_client_url, 'job_id', new.id));
  end if;
  return new;
end $$;

-- ═════════════════════════ 2. Reportar y bloquear (App Store 1.2) ═════════════════════════
create table public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.user_blocks enable row level security;
grant select, delete on public.user_blocks to authenticated;
create policy "bloqueos: los propios" on public.user_blocks for select to authenticated using (blocker_id = (select auth.uid()) or public.is_staff());
create policy "bloqueos: quitar los propios" on public.user_blocks for delete to authenticated using (blocker_id = (select auth.uid()));

create function private.is_blocked(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_blocks where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a))
$$;

create table public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id),
  reported_id uuid not null references public.profiles (id),
  job_id uuid references public.jobs (id),
  reason text not null check (reason in ('harassment', 'fraud', 'off_app_payment', 'inappropriate', 'safety', 'other')),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewed', 'actioned', 'dismissed')),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);
alter table public.user_reports enable row level security;
grant select on public.user_reports to authenticated;
create policy "reportes: los propios o soporte" on public.user_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or public.is_staff());

-- Solo se puede reportar o bloquear a alguien con quien hubo un pedido (evita abuso del sistema).
create function private.shares_job(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.jobs j left join public.offers o on o.job_id = j.id
    where (j.client_id = p_a and o.pro_id = p_b) or (j.client_id = p_b and o.pro_id = p_a)
  )
$$;

create function public.report_user(p_user uuid, p_reason text, p_details text default null, p_job uuid default null, p_block boolean default true)
returns public.user_reports language plpgsql security definer set search_path = '' as $$
declare v public.user_reports;
begin
  if (select auth.uid()) is null or p_user = (select auth.uid()) or not private.shares_job((select auth.uid()), p_user) then
    raise exception 'Solo puedes reportar a alguien con quien tuviste un pedido' using errcode = '42501';
  end if;
  insert into public.user_reports (reporter_id, reported_id, job_id, reason, details)
  values (auth.uid(), p_user, p_job, p_reason, nullif(btrim(p_details), '')) returning * into v;
  if p_block then
    perform public.block_user(p_user);
  end if;
  return v;
end $$;

create function public.block_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or p_user = (select auth.uid()) or not private.shares_job((select auth.uid()), p_user) then
    raise exception 'Solo puedes bloquear a alguien con quien tuviste un pedido' using errcode = '42501';
  end if;
  insert into public.user_blocks (blocker_id, blocked_id) values (auth.uid(), p_user) on conflict do nothing;
  -- Las ofertas pendientes entre ambos dejan de contar.
  update public.offers o set status = 'withdrawn'
  from public.jobs j
  where o.job_id = j.id and o.status = 'pending'
    and ((j.client_id = auth.uid() and o.pro_id = p_user) or (j.client_id = p_user and o.pro_id = auth.uid()));
end $$;
grant execute on function public.report_user(uuid, text, text, uuid, boolean), public.block_user(uuid) to authenticated;

-- Efectos del bloqueo: no hay chat, ni ofertas, ni pedidos visibles entre ambos.
create or replace function public.send_job_message(p_job uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_reason text;
  v_id bigint;
  v_client uuid := private.job_client_id(p_job);
  v_pro uuid := private.job_assigned_pro_id(p_job);
begin
  if v_pro is null or (select auth.uid()) not in (v_client, v_pro) then
    raise exception 'No participas en este servicio' using errcode = '42501';
  end if;
  if private.is_blocked(v_client, v_pro) then
    raise exception 'No puedes escribir: hay un bloqueo entre ustedes' using errcode = '42501';
  end if;
  if not private.is_active_service(private.job_status(p_job)) then
    raise exception 'El chat se cierra cuando el servicio termina' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 1000 then
    raise exception 'Mensaje vacío o muy largo' using errcode = '22023';
  end if;
  v_reason := private.chat_violation(p_body);
  if v_reason is not null then
    insert into public.chat_flags (job_id, sender_id, reason) values (p_job, auth.uid(), v_reason);
    return jsonb_build_object('blocked', true, 'reason', v_reason);
  end if;
  insert into public.job_messages (job_id, sender_id, body) values (p_job, auth.uid(), btrim(p_body)) returning id into v_id;
  return jsonb_build_object('blocked', false, 'id', v_id);
end $$;

drop policy "offers: crear si el pro es elegible y no está en pausa" on public.offers;
create policy "offers: crear si el pro es elegible, sin pausa ni bloqueo" on public.offers for insert to authenticated
  with check (
    pro_id = (select auth.uid())
    and status = 'pending'
    and private.job_client_id(job_id) <> (select auth.uid())
    and private.job_status(job_id) in ('published', 'with_offers')
    and private.pro_is_eligible_for_job(job_id)
    and not private.pro_is_paused((select auth.uid()))
    and not private.is_blocked((select auth.uid()), private.job_client_id(job_id))
  );

-- ═════════════════════════ 3. Soporte y ayuda ═════════════════════════
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  job_id uuid references public.jobs (id),
  category text not null check (category in ('payment', 'safety', 'account', 'claim', 'app', 'other')),
  subject text not null check (char_length(subject) between 3 and 120),
  body text not null check (char_length(body) between 10 and 3000),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  staff_reply text,
  replied_by uuid references public.profiles (id),
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.support_tickets (status, created_at);
alter table public.support_tickets enable row level security;
grant select, insert (job_id, category, subject, body) on public.support_tickets to authenticated;
create policy "tickets: los propios o soporte" on public.support_tickets for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff());
create policy "tickets: crear propios" on public.support_tickets for insert to authenticated
  with check (user_id = (select auth.uid()) and (job_id is null or (select auth.uid()) in (private.job_client_id(job_id), private.job_assigned_pro_id(job_id))));

create function public.reply_ticket(p_ticket uuid, p_reply text, p_close boolean default false) returns public.support_tickets
language plpgsql security definer set search_path = '' as $$
declare v public.support_tickets;
begin
  if not public.is_staff() then
    raise exception 'Solo soporte responde tickets' using errcode = '42501';
  end if;
  if nullif(btrim(p_reply), '') is null then
    raise exception 'Escribe la respuesta' using errcode = '22023';
  end if;
  update public.support_tickets set staff_reply = btrim(p_reply), replied_by = auth.uid(), replied_at = now(),
    status = case when p_close then 'closed' else 'answered' end
  where id = p_ticket returning * into v;
  if not found then
    raise exception 'Ticket no encontrado' using errcode = 'P0002';
  end if;
  perform private.notify(v.user_id, 'support_reply', 'Soporte respondió tu consulta', left(v.staff_reply, 120),
    jsonb_build_object('url', '/ajustes/ayuda'));
  return v;
end $$;
grant execute on function public.reply_ticket(uuid, text, boolean) to authenticated;

-- ═════════════════════════ 4. Programación del pedido ═════════════════════════
alter table public.jobs
  add column schedule_kind text not null default 'now' check (schedule_kind in ('now', 'later_today', 'scheduled')),
  add column scheduled_for timestamptz;
grant select (schedule_kind, scheduled_for) on public.jobs to authenticated;
grant insert (schedule_kind, scheduled_for) on public.jobs to authenticated;

create function private.check_schedule() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.schedule_kind = 'now' then
    new.scheduled_for := null;
  elsif new.scheduled_for is null or new.scheduled_for < now() - interval '5 minutes'
     or new.scheduled_for > now() + interval '30 days' then
    raise exception 'Elige una fecha y hora entre ahora y los próximos 30 días' using errcode = '22023';
  elsif new.schedule_kind = 'later_today'
     and (new.scheduled_for at time zone 'America/Lima')::date <> (now() at time zone 'America/Lima')::date then
    raise exception '“Hoy más tarde” debe ser hoy' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger check_schedule before insert on public.jobs for each row execute function private.check_schedule();

drop function public.nearby_jobs();
create function public.nearby_jobs()
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
  order by 7, j.created_at desc
$$;
grant execute on function public.nearby_jobs() to authenticated;

-- ═════════════════════════ 5. Suspensión manual y reversión de asientos ═════════════════════════
alter table public.profiles add column suspended_at timestamptz, add column suspended_reason text;
grant select (suspended_at, suspended_reason) on public.profiles to authenticated;

create table public.admin_actions (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles (id),
  action text not null,
  target_user uuid references public.profiles (id),
  target_entry uuid,
  note text not null,
  created_at timestamptz not null default now()
);
alter table public.admin_actions enable row level security;
grant select on public.admin_actions to authenticated;
create policy "auditoría: solo soporte" on public.admin_actions for select to authenticated using (public.is_staff());
create trigger admin_actions_immutable before update or delete on public.admin_actions
  for each row execute function private.forbid_change();

-- Suspender: bloquea el acceso (auth.users.banned_until), saca de línea al pro y queda auditado.
create function public.admin_set_suspension(p_user uuid, p_suspend boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador suspende cuentas' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Escribe el motivo' using errcode = '22023';
  end if;
  if p_user = (select auth.uid()) then
    raise exception 'No puedes suspenderte a ti mismo' using errcode = '22023';
  end if;
  update public.profiles set suspended_at = case when p_suspend then now() end,
    suspended_reason = case when p_suspend then btrim(p_reason) end
  where id = p_user;
  if not found then
    raise exception 'Usuario no encontrado' using errcode = 'P0002';
  end if;
  update auth.users set banned_until = case when p_suspend then 'infinity'::timestamptz end where id = p_user;
  if p_suspend then
    update public.pro_presence set online = false where pro_id = p_user;
    delete from auth.refresh_tokens where user_id = p_user::text;
    delete from auth.sessions where user_id = p_user;
  end if;
  insert into public.admin_actions (actor_id, action, target_user, note)
  values (auth.uid(), case when p_suspend then 'suspend' else 'unsuspend' end, p_user, btrim(p_reason));
end $$;
grant execute on function public.admin_set_suspension(uuid, boolean, text) to authenticated;

create or replace function private.pro_is_eligible(p_trade smallint, p_point extensions.geography) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.pro_trades pt
    join public.pro_presence pp on pp.pro_id = pt.pro_id
    join public.profiles pr on pr.id = pt.pro_id and pr.suspended_at is null and pr.deleted_at is null
    where pt.pro_id = (select auth.uid())
      and pt.trade_id = p_trade
      and pt.status in ('approved_observation', 'approved_full')
      and pp.online
      and pp.last_point is not null
      and extensions.st_dwithin(pp.last_point, p_point, pp.radius_m)
  )
$$;

-- Reversión: un asiento opuesto con clave reversal:<id> (idempotente). Nunca se edita el original (regla 2).
create function public.admin_reverse_entry(p_entry uuid, p_note text) returns public.wallet_entries
language plpgsql security definer set search_path = '' as $$
declare
  v_entry public.wallet_entries;
  v public.wallet_entries;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador revierte asientos' using errcode = '42501';
  end if;
  if nullif(btrim(p_note), '') is null then
    raise exception 'Escribe el motivo de la reversión' using errcode = '22023';
  end if;
  select * into v_entry from public.wallet_entries where id = p_entry;
  if not found then
    raise exception 'Asiento no encontrado' using errcode = 'P0002';
  end if;
  if v_entry.type = 'reversal' then
    raise exception 'No se revierte una reversión' using errcode = 'P0001';
  end if;
  v := private.wallet_post(v_entry.professional_id, 'reversal', -v_entry.amount_cents, 'reversal:' || p_entry,
    v_entry.job_id, 'revierte ' || p_entry || ': ' || btrim(p_note), auth.uid());
  insert into public.admin_actions (actor_id, action, target_user, target_entry, note)
  values (auth.uid(), 'reverse_entry', v_entry.professional_id, p_entry, btrim(p_note));
  return v;
end $$;
grant execute on function public.admin_reverse_entry(uuid, text) to authenticated;

-- Buscador global del panel (usuarios por nombre o celular, pedidos por id o descripción).
create function public.admin_search(p_query text)
returns table (kind text, id uuid, title text, subtitle text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with q as (select btrim(p_query) as t, regexp_replace(p_query, '\D', '', 'g') as digits)
  (select 'user', p.id, coalesce(p.full_name, 'Sin nombre'),
     coalesce(p.phone, 'sin teléfono') || ' · ' || p.active_role ||
       case when p.suspended_at is not null then ' · SUSPENDIDO' else '' end ||
       case when p.deleted_at is not null then ' · eliminado' else '' end,
     p.created_at
   from public.profiles p, q
   where public.is_staff() and char_length(q.t) >= 2
     and (p.full_name ilike '%' || q.t || '%' or (char_length(q.digits) >= 4 and p.phone like '%' || q.digits || '%')
          or p.id::text = q.t)
   order by p.created_at desc limit 20)
  union all
  (select 'job', j.id, left(j.description, 80), j.status::text || ' · S/ ' || to_char(coalesce(j.final_price_cents, j.offered_price_cents) / 100.0, 'FM999990.00'),
     j.created_at
   from public.jobs j, q
   where public.is_staff() and char_length(q.t) >= 2
     and (j.description ilike '%' || q.t || '%' or j.id::text = q.t)
   order by j.created_at desc limit 20)
$$;
grant execute on function public.admin_search(text) to authenticated;

-- ═════════════════════════ 6. Datos de pago de la empresa ═════════════════════════
-- Nombres definitivos: yape_number, plin_number, plin_qr_url, yape_qr_url, account_holder, bank_account.
insert into public.settings (key, scope, value)
select replace(replace(key, 'company_', ''), 'account_holder', 'account_holder'), scope, value from public.settings
where key in ('company_yape_number', 'company_plin_number', 'company_account_holder', 'company_bank_account')
on conflict (key, scope) do nothing;
delete from public.settings where key like 'company_%';
insert into public.settings (key, scope, value) values
  ('yape_number', 'global', '""'), ('plin_number', 'global', '""'), ('account_holder', 'global', '""'),
  ('bank_account', 'global', '""'), ('yape_qr_url', 'global', '""'), ('plin_qr_url', 'global', '""')
on conflict (key, scope) do nothing;

-- ═════════════════════════ 7. Anti-abuso de SMS ═════════════════════════
-- Hook “before user created” de Supabase Auth: solo celulares peruanos (+51 9XXXXXXXX).
-- Corta el bombeo de SMS internacional antes de que se envíe un código.
create function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare v_phone text := coalesce(event -> 'user' ->> 'phone', '');
begin
  if v_phone = '' and coalesce(event -> 'user' ->> 'email', '') <> '' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Cerquita solo permite ingresar con celular.'));
  end if;
  if regexp_replace(v_phone, '\D', '', 'g') !~ '^519\d{8}$' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Solo se aceptan celulares peruanos (+51 9XX XXX XXX).'));
  end if;
  return '{}'::jsonb;
end $$;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;

-- ═════════════════════════ Triggers de notificaciones (al final: dependen de is_blocked) ═════════════════════════
create trigger on_job_published_notify after insert on public.jobs for each row execute function private.on_job_published_notify();
create trigger on_offer_notify after insert on public.offers for each row execute function private.on_offer_notify();
create trigger on_message_notify after insert on public.job_messages for each row execute function private.on_message_notify();
create trigger on_job_status_notify after update on public.jobs for each row execute function private.on_job_status_notify();

-- Envío: cada minuto pg_cron llama a la Edge Function send-push si está configurada
-- (settings.push_function_url + secreto en Vault “push_function_secret”). Ver docs/produccion.md.
insert into public.settings (key, scope, value) values ('push_function_url', 'global', '""') on conflict do nothing;
create function private.dispatch_push() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text := private.setting_text('push_function_url', '');
  v_secret text;
begin
  if v_url = '' or not exists (select 1 from public.notification_outbox where status = 'pending') then
    return;
  end if;
  begin
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_function_secret';
  exception when others then
    v_secret := null;
  end;
  perform net.http_post(url := v_url, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || coalesce(v_secret, '')));
end $$;
select cron.schedule('dispatch-push', '* * * * *', $$select private.dispatch_push()$$);
-- Reintentos de la Edge Function (solo service role).
create function public.outbox_mark_failed(p_ids bigint[], p_error text) returns void
language sql security definer set search_path = '' as $$
  update public.notification_outbox
  set attempts = attempts + 1, error = left(p_error, 300),
      status = case when attempts + 1 >= 3 then 'failed' else 'pending' end
  where id = any (p_ids)
$$;
revoke execute on function public.outbox_mark_failed(bigint[], text) from public, anon, authenticated;
grant execute on function public.outbox_mark_failed(bigint[], text) to service_role;

-- Purga de la bandeja (30 días) junto con la de ubicaciones.
select cron.schedule('purge-outbox', '27 3 * * *', $$delete from public.notification_outbox where created_at < now() - interval '30 days'$$);

-- Revisión de reportes de usuarios (soporte). “actioned” = se tomó una medida (p. ej. suspensión).
create function public.review_report(p_report uuid, p_status text, p_note text) returns public.user_reports
language plpgsql security definer set search_path = '' as $$
declare v public.user_reports;
begin
  if not public.is_staff() then
    raise exception 'Solo soporte revisa reportes' using errcode = '42501';
  end if;
  if p_status not in ('reviewed', 'actioned', 'dismissed') or nullif(btrim(p_note), '') is null then
    raise exception 'Estado o nota inválidos' using errcode = '22023';
  end if;
  update public.user_reports set status = p_status, note = btrim(p_note), reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_report returning * into v;
  if not found then
    raise exception 'Reporte no encontrado' using errcode = 'P0002';
  end if;
  return v;
end $$;
grant execute on function public.review_report(uuid, text, text) to authenticated;
