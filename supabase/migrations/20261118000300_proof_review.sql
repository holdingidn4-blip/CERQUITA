-- Tiempo de revisión de constancias de comisión: la app le dice al profesional en cuánto
-- responde soporte y el panel marca las que pasaron ese plazo (reseña: “el soporte nunca responde”).
insert into public.settings (key, scope, value) values ('proof_review_hours', 'global', '2')
on conflict (key, scope) do nothing;
