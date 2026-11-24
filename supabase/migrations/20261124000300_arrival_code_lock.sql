-- F7 · El código de llegada (4 dígitos) no se puede adivinar probando: tras `arrival_code_max_attempts` intentos
-- fallidos se bloquea `arrival_code_lock_minutes` minutos y se avisa al cliente. Un código equivocado ya no
-- lanza error (el contador se perdería con el rollback): devuelve el pedido aún "En camino" con los intentos.

insert into public.settings (key, scope, value) values
  ('arrival_code_max_attempts', 'global', '3'),
  ('arrival_code_lock_minutes', 'global', '10')
on conflict (key, scope) do nothing;

alter table public.jobs
  add column arrival_failed_attempts smallint not null default 0 check (arrival_failed_attempts >= 0),
  add column arrival_locked_until timestamptz;
grant select (arrival_failed_attempts, arrival_locked_until) on public.jobs to authenticated;

create or replace function public.arrive(p_job uuid, p_code text) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare
  v public.jobs;
  v_max int := greatest(private.setting_int('arrival_code_max_attempts', 3), 1);
begin
  v := private.require_assigned_pro(p_job);
  perform private.require_status(v, 'on_the_way');
  if v.arrival_locked_until > now() then
    raise exception 'Código bloqueado por intentos fallidos. Vuelve a intentar a las % o pídele al cliente que te lo dicte.',
      to_char(v.arrival_locked_until at time zone 'America/Lima', 'HH24:MI') using errcode = 'P0001';
  end if;
  if v.security_code is distinct from btrim(coalesce(p_code, '')) then
    update public.jobs set
      arrival_failed_attempts = arrival_failed_attempts + 1,
      arrival_locked_until = case when arrival_failed_attempts + 1 >= v_max
        then now() + make_interval(mins => private.setting_int('arrival_code_lock_minutes', 10)) end
    where id = p_job returning * into v;
    if v.arrival_locked_until is not null then
      perform private.notify(v.client_id, 'arrival_code_locked', 'Código de llegada bloqueado',
        'Se escribió mal tu código de seguridad varias veces. Si el profesional está en tu puerta, díctaselo en persona; si no, escríbenos desde Ayuda.',
        jsonb_build_object('url', '/servicio/' || p_job, 'job_id', p_job));
    end if;
    return v;
  end if;
  update public.jobs set status = 'at_home', arrived_at = now(), arrival_failed_attempts = 0, arrival_locked_until = null
  where id = p_job returning * into v;
  return v;
end $$;
