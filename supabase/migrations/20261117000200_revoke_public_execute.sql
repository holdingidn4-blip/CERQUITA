-- Seguridad: la migración anterior quitó EXECUTE a anon, pero anon lo seguía heredando de PUBLIC
-- (en producción varias funciones quedaron con “=X”). Aquí se cierra PUBLIC.
-- Antes se da EXECUTE explícito a authenticated en las dos RPC de reevaluación que la app usa
-- y que solo lo tenían vía PUBLIC; el resto ya tiene su grant explícito. No se abre nada nuevo.
grant execute on function public.propose_reevaluation(uuid, integer, public.materials_provider, jsonb, text) to authenticated;
grant execute on function public.answer_reevaluation(uuid, boolean) to authenticated;

revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
