-- Limpieza de Storage sin repartir la llave service_role (antes dependía de un secreto en GitHub):
-- pg_cron llama cada hora a la Edge Function storage-cleanup, igual que send-push, con el secreto
-- de Vault. Solo borra si storage_cleanup_enabled = 1; mientras tanto cuenta los huérfanos.
insert into public.settings (key, scope, value) values
  ('storage_cleanup_url', 'global', '""'),
  ('storage_cleanup_enabled', 'global', '0')
on conflict (key, scope) do nothing;

create function private.dispatch_storage_cleanup() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text := private.setting_text('storage_cleanup_url', '');
  v_secret text;
begin
  if v_url = '' then
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
-- Solo la usa pg_cron: nadie con sesión la ejecuta.
revoke execute on function private.dispatch_storage_cleanup() from authenticated;

select cron.schedule('storage-cleanup', '17 * * * *', $$select private.dispatch_storage_cleanup()$$);
