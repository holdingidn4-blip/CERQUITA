-- Seguridad: ninguna función de public debe ejecutarse sin sesión.
-- Supabase concede EXECUTE a anon por defecto. Las migraciones anteriores ya quitaron PUBLIC
-- y dieron a authenticated solo lo que la app usa; aquí se cierra anon, sin abrir nada nuevo.
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke execute on functions from anon;
