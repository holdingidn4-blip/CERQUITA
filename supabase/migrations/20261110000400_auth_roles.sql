-- Fase 3 · Ingreso por SMS y roles.
-- Cliente/Profesional: profiles.active_role (lo cambia el propio usuario).
-- Soporte: auth.users.raw_app_meta_data.staff_role (solo el service role).

-- El teléfono del perfil sigue al de auth.users (p. ej. si cambia de número).
create function private.sync_profile_phone() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set phone = new.phone where id = new.id;
  return new;
end $$;
revoke execute on function private.sync_profile_phone() from authenticated;

create trigger on_auth_user_phone_changed after update of phone on auth.users
  for each row when (old.phone is distinct from new.phone)
  execute function private.sync_profile_phone();

-- Asigna o quita un rol de soporte. Llamar desde el servidor (service role) o con el script del panel.
-- El usuario debe volver a ingresar para que su token incluya el rol.
create function public.set_staff_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_role is not null and p_role not in ('reviewer', 'support', 'admin') then
    raise exception 'Rol de soporte inválido: %', p_role using errcode = '22023';
  end if;
  update auth.users
  set raw_app_meta_data = case
    when p_role is null then coalesce(raw_app_meta_data, '{}'::jsonb) - 'staff_role'
    else coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('staff_role', p_role)
  end
  where id = p_user;
  if not found then
    raise exception 'Usuario no encontrado' using errcode = 'P0002';
  end if;
end $$;
revoke execute on function public.set_staff_role(uuid, text) from public, anon, authenticated;
grant execute on function public.set_staff_role(uuid, text) to service_role;

-- Estado de la cuenta en una sola llamada para decidir a dónde ir tras ingresar.
create function public.my_account()
returns table (
  id uuid, phone text, full_name text, active_role public.user_role,
  avatar_url text, has_pro_trades boolean, staff_role text
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.phone, p.full_name, p.active_role, p.avatar_url,
    exists (select 1 from public.pro_trades pt where pt.pro_id = p.id),
    nullif(auth.jwt() -> 'app_metadata' ->> 'staff_role', '')
  from public.profiles p
  where p.id = (select auth.uid()) and p.deleted_at is null
$$;
grant execute on function public.my_account() to authenticated;
