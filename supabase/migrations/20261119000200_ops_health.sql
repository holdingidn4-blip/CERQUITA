-- Vigilancia de la operación para el panel: tareas programadas (pg_cron), cola de notificaciones
-- y llamadas HTTP salientes (pg_net). Solo soporte. Lee, no cambia nada.

insert into public.settings (key, scope, value) values
  ('ops_outbox_stale_minutes', 'global', '10')
on conflict (key, scope) do nothing;

create function public.ops_health()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_stale int := private.setting_int('ops_outbox_stale_minutes', 10);
  v_result jsonb;
begin
  if not public.is_staff() then
    raise exception 'solo soporte' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'checked_at', now(),
    'cron', coalesce((
      select jsonb_agg(c order by c ->> 'name')
      from (
        select jsonb_build_object(
          'name', j.jobname,
          'schedule', j.schedule,
          'active', j.active,
          'last_start', last.start_time,
          'last_end', last.end_time,
          'last_status', last.status,
          'last_message', left(last.return_message, 200),
          'runs_24h', (select count(*) from cron.job_run_details d
                       where d.jobid = j.jobid and d.start_time > now() - interval '24 hours'),
          'failures_24h', (select count(*) from cron.job_run_details d
                           where d.jobid = j.jobid and d.start_time > now() - interval '24 hours'
                             and d.status = 'failed')
        ) as c
        from cron.job j
        left join lateral (
          select d.start_time, d.end_time, d.status, d.return_message
          from cron.job_run_details d
          where d.jobid = j.jobid
          order by d.start_time desc nulls last
          limit 1
        ) last on true
      ) s
    ), '[]'::jsonb),
    'outbox', (
      select jsonb_build_object(
        'pending', count(*) filter (where o.status = 'pending'),
        'stale', count(*) filter (where o.status = 'pending' and o.created_at < now() - make_interval(mins => v_stale)),
        'oldest_pending', min(o.created_at) filter (where o.status = 'pending'),
        'sent_24h', count(*) filter (where o.status = 'sent' and o.sent_at > now() - interval '24 hours'),
        'failed_24h', count(*) filter (where o.status = 'failed' and o.created_at > now() - interval '24 hours'),
        'skipped_24h', count(*) filter (where o.status = 'skipped' and o.created_at > now() - interval '24 hours'),
        'last_sent', max(o.sent_at),
        'stale_minutes', v_stale
      )
      from public.notification_outbox o
    ),
    'http', (
      select jsonb_build_object(
        'total', count(*),
        'ok', count(*) filter (where r.status_code between 200 and 299),
        'errors', count(*) filter (where r.status_code is null or r.status_code >= 400 or r.timed_out),
        'last_error', (
          select jsonb_build_object('at', e.created, 'status', e.status_code,
            'message', left(coalesce(e.error_msg, e.content), 200))
          from net._http_response e
          where e.status_code is null or e.status_code >= 400 or e.timed_out
          order by e.created desc
          limit 1
        )
      )
      from net._http_response r
    )
  ) into v_result;

  return v_result;
end $$;

revoke execute on function public.ops_health() from public, anon;
grant execute on function public.ops_health() to authenticated;
