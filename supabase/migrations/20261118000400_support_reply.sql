-- Plazo de respuesta de los tickets de ayuda: la app le dice al usuario en cuánto responde
-- soporte y el panel marca los tickets abiertos que pasaron ese plazo.
insert into public.settings (key, scope, value) values ('support_reply_hours', 'global', '8')
on conflict (key, scope) do nothing;
