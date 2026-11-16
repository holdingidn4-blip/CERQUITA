-- Correcciones del piloto (no destructivas).
-- 1. Eliminar cuenta fallaba para un profesional cuyos documentos ya vio soporte.
-- 2. El panel ya no necesita la llave service_role para abrir documentos de verificación.
-- 3. La función send-push valida su secreto contra Vault (sin secreto en variables de entorno).

-- ───────── 1. Registro de vistas que sobrevive al documento ─────────
-- delete_my_account() borra verification_documents; el FK en cascada intentaba borrar
-- document_access_log, que es inmutable (trigger forbid_change) y fallaba toda la operación.
-- El registro de auditoría debe conservarse aunque el documento se elimine (regla 6 / Ley 29733),
-- así que document_id deja de ser FK y queda como referencia histórica.
alter table public.document_access_log drop constraint if exists document_access_log_document_id_fkey;
comment on column public.document_access_log.document_id is
  'Documento visto. Sin FK a propósito: el registro se conserva aunque el documento se elimine.';

-- ───────── 2. Soporte firma la URL con su propia sesión, solo con la vista registrada ─────────
-- Antes el panel usaba service_role para firmar. Ahora el bucket privado permite leer un archivo
-- de verificación solo a soporte y solo si registró esa vista (log_document_access) hace < 2 min.
create function private.document_view_logged(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.document_access_log l
    join public.verification_documents d on d.id = l.document_id
    where d.storage_path = p_path
      and l.viewer_id = (select auth.uid())
      and l.viewed_at > now() - interval '2 minutes'
  )
$$;
revoke execute on function private.document_view_logged(text) from public, anon;
grant execute on function private.document_view_logged(text) to authenticated;

create policy "verification: soporte con vista registrada" on storage.objects for select to authenticated
  using (bucket_id = 'verification' and public.is_staff() and private.document_view_logged(name));

-- ───────── 3. Secreto de send-push en Vault ─────────
-- La Edge Function lo compara con el que envía pg_cron (dispatch_push) sin conocerlo.
create function public.push_secret_matches(p_secret text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v text;
begin
  select decrypted_secret into v from vault.decrypted_secrets where name = 'push_function_secret';
  return v is not null and length(v) >= 32 and p_secret = v;
exception when others then
  return false;
end $$;
revoke execute on function public.push_secret_matches(text) from public, anon, authenticated;
grant execute on function public.push_secret_matches(text) to service_role;
