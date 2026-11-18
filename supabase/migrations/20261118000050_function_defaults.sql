-- Seguridad: los privilegios por defecto de 20261117000200 se fijaron "in schema public", pero
-- Postgres suma los de cada esquema a los globales y el global da EXECUTE a PUBLIC. Resultado:
-- cada función nueva volvía a quedar ejecutable sin sesión (anon hereda de PUBLIC).
-- Aquí se cambia el valor global para las funciones que crea postgres (las migraciones):
-- sin PUBLIC y con EXECUTE para authenticated y service_role, como hasta ahora menos anon.
-- Las funciones ya creadas no cambian (siguen como las dejó 20261117000200).
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres grant execute on functions to authenticated, service_role;
