-- Recordatorios de pedidos programados ("Hoy más tarde" y "Programar"): un aviso por pedido,
-- `schedule_reminder_minutes` antes de la hora (60 por defecto), por la cola de notificaciones.
-- Con profesional asignado: avisa al cliente y al profesional. Sin profesional: avisa al cliente
-- que revise las ofertas. No avisa pedidos publicados ya dentro de la ventana (serían redundantes).

insert into public.settings (key, scope, value) values
  ('schedule_reminder_minutes', 'global', '60')
on conflict (key, scope) do nothing;

alter table public.jobs add column schedule_reminded_at timestamptz;

create function private.send_schedule_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_minutes int := private.setting_int('schedule_reminder_minutes', 60);
  v_job record;
  v_when text;
  v_count int := 0;
begin
  for v_job in
    select j.id, j.client_id, j.status, j.scheduled_for
    from public.jobs j
    where j.scheduled_for is not null
      and j.schedule_reminded_at is null
      and j.status in ('published', 'with_offers', 'accepted')
      and j.scheduled_for > now()
      and j.scheduled_for <= now() + make_interval(mins => v_minutes)
      and j.created_at <= j.scheduled_for - make_interval(mins => v_minutes)
    order by j.scheduled_for
    for update skip locked
  loop
    v_when := to_char(v_job.scheduled_for at time zone 'America/Lima', 'HH24:MI');
    if v_job.status = 'accepted' then
      perform private.notify(v_job.client_id, 'schedule_reminder',
        'Tu servicio es a las ' || v_when,
        'Tu profesional llegará a la hora acordada. Ten a mano tu código de seguridad.',
        jsonb_build_object('url', '/servicio/' || v_job.id, 'job_id', v_job.id));
      perform private.notify(private.job_assigned_pro_id(v_job.id), 'schedule_reminder',
        'Tienes un servicio a las ' || v_when,
        'Cuando salgas, toca “Ir al domicilio” para que el cliente vea tu llegada.',
        jsonb_build_object('url', '/trabajo/' || v_job.id, 'job_id', v_job.id));
    else
      perform private.notify(v_job.client_id, 'schedule_no_pro',
        'Tu pedido de las ' || v_when || ' aún no tiene profesional',
        case when v_job.status = 'with_offers'
          then 'Ya tienes ofertas: elige una para asegurar la visita.'
          else 'Todavía nadie cotizó. Puedes esperar o subir tu precio.' end,
        jsonb_build_object('url', '/pedido/' || v_job.id || '/ofertas', 'job_id', v_job.id));
    end if;
    update public.jobs set schedule_reminded_at = now() where id = v_job.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

revoke execute on function private.send_schedule_reminders() from public, authenticated;

select cron.schedule('schedule-reminders', '*/5 * * * *', $$select private.send_schedule_reminders()$$);
