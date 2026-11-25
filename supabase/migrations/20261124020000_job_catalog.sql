-- Sección 4 · Catálogo de trabajos por oficio.
-- · De 9 a 12 trabajos frecuentes por oficio, con palabras de búsqueda. Soporte lo edita desde el panel.
-- · Trabajos de riesgo (gas, tableros, termas…): se aprueban uno por uno, aparte del oficio.
-- · "Otro trabajo": texto libre del profesional, pendiente de revisión. No recibe pedidos hasta que
--   soporte lo apruebe y lo agregue al catálogo.
-- · El cliente puede elegir el trabajo al publicar. Un pedido de un trabajo de riesgo solo lo ven,
--   lo reciben y lo cotizan los profesionales con ese trabajo aprobado.
-- Solo agrega: columnas nuevas, filas nuevas del catálogo y funciones. No borra ni cambia datos existentes
-- (las filas del catálogo que ya estaban solo reciben valores en las columnas nuevas).

insert into public.settings (key, scope, value) values
  ('custom_specialty_max_pending', 'global', '3')
on conflict (key, scope) do nothing;

-- ═════════════ Catálogo ═════════════
alter table public.trade_specialties
  add column requires_review boolean not null default false,
  add column search_terms text not null default '' check (char_length(search_terms) <= 300),
  add column sort_order smallint not null default 100 check (sort_order between 0 and 999),
  add column updated_at timestamptz not null default now(),
  add column updated_by uuid references public.profiles (id);
create index on public.trade_specialties (updated_by);
create index on public.trade_specialties (trade_id, sort_order);

insert into public.trade_specialties (trade_id, slug, name, requires_review, sort_order, search_terms)
select t.id, v.slug, v.name, v.risky, v.sort, v.terms
from public.trades t
join (values
  ('gasfiteria', 'fugas-agua', 'Fugas de agua', false, 10, 'caño gotea goteo filtración'),
  ('gasfiteria', 'griferia', 'Instalación y cambio de grifería', false, 20, 'caño grifo llave mezcladora ducha'),
  ('gasfiteria', 'inodoros-lavaderos', 'Inodoros y lavaderos', false, 30, 'baño wáter taza lavatorio'),
  ('gasfiteria', 'termas', 'Termas y calentadores', true, 40, 'terma agua caliente calentador'),
  ('gasfiteria', 'gas', 'Instalación de gas', true, 50, 'balón glp cocina gas natural'),
  ('gasfiteria', 'desatoro', 'Desatoro de desagües', false, 60, 'atoro atasco desagüe buzón sumidero'),
  ('gasfiteria', 'tanques-cisternas', 'Tanques y cisternas', false, 70, 'tanque elevado cisterna flotador'),
  ('gasfiteria', 'bombas-agua', 'Bombas de agua', false, 80, 'bomba presión hidroneumático motor'),
  ('gasfiteria', 'tuberias-empotradas', 'Tuberías empotradas', false, 90, 'tubería pared rotura picado'),
  ('gasfiteria', 'deteccion-fugas', 'Detección de fugas', false, 100, 'fuga oculta humedad recibo alto'),
  ('gasfiteria', 'agua-desague', 'Agua y desagüe', false, 110, 'instalación sanitaria red'),
  ('electricidad', 'cortocircuitos', 'Cortocircuitos y apagones', false, 10, 'corto se va la luz chispa salta la llave'),
  ('electricidad', 'tomacorrientes', 'Tomacorrientes e interruptores', false, 20, 'enchufe toma interruptor apagador'),
  ('electricidad', 'iluminacion', 'Iluminación', false, 30, 'foco luces lámpara led fluorescente'),
  ('electricidad', 'tableros', 'Tableros y llaves', true, 40, 'tablero llave térmica diferencial breaker'),
  ('electricidad', 'instalaciones', 'Instalaciones eléctricas', false, 50, 'instalación nueva casa'),
  ('electricidad', 'cableado', 'Cambio de cableado', true, 60, 'cables viejos recableado'),
  ('electricidad', 'pozo-tierra', 'Pozo a tierra', true, 70, 'puesta a tierra descarga medición'),
  ('electricidad', 'medidor', 'Medidor y acometida', true, 80, 'medidor luz acometida suministro'),
  ('electricidad', 'duchas-electricas', 'Duchas eléctricas', true, 90, 'ducha eléctrica terma de paso'),
  ('electricidad', 'timbres', 'Timbres e intercomunicadores', false, 100, 'timbre intercomunicador portero'),
  ('electricidad', 'ventiladores', 'Ventiladores de techo', false, 110, 'ventilador techo'),
  ('electricidad', 'camaras', 'Cámaras con cableado', false, 120, 'cámaras seguridad cctv'),
  ('hogar', 'lavadoras', 'Lavadoras y secadoras', false, 10, 'lavadora secadora no centrifuga'),
  ('hogar', 'refrigeradoras', 'Refrigeradoras y congeladoras', false, 20, 'refri nevera congeladora no enfría'),
  ('hogar', 'cocinas', 'Cocinas y hornos a gas', true, 30, 'cocina horno hornilla quemador gas'),
  ('hogar', 'electrodomesticos', 'Electrodomésticos', false, 40, 'microondas licuadora artefactos'),
  ('hogar', 'cerrajeria', 'Cerrajería', true, 50, 'chapa cerradura llave abrir puerta'),
  ('hogar', 'instalaciones-varias', 'Instalaciones varias (TV, repisas)', false, 60, 'televisor soporte repisa cuadro'),
  ('hogar', 'cortinas', 'Cortinas y persianas', false, 70, 'cortina persiana riel barra'),
  ('hogar', 'armado-muebles', 'Armado de muebles', false, 80, 'armar mueble ropero escritorio'),
  ('hogar', 'mantenimiento', 'Mantenimiento general', false, 90, 'arreglos varios maestro casa'),
  ('carpinteria', 'muebles', 'Muebles a medida', false, 10, 'mueble medida diseño'),
  ('carpinteria', 'closets', 'Closets y roperos', false, 20, 'closet ropero armario'),
  ('carpinteria', 'cocinas-melamina', 'Muebles de cocina', false, 30, 'melamina reposteros cocina'),
  ('carpinteria', 'puertas-ventanas', 'Puertas y ventanas', false, 40, 'puerta ventana marco'),
  ('carpinteria', 'reparaciones', 'Reparaciones de madera', false, 50, 'arreglo madera mueble roto'),
  ('carpinteria', 'pisos-madera', 'Pisos de madera y parquet', false, 60, 'parquet piso madera laminado'),
  ('carpinteria', 'barnizado', 'Barnizado y lacado', false, 70, 'barniz laca acabado madera'),
  ('carpinteria', 'herrajes', 'Chapas, bisagras y rieles', false, 80, 'bisagra riel chapa cajón'),
  ('carpinteria', 'repisas', 'Repisas y estantes', false, 90, 'repisa estante librero'),
  ('pintura', 'interiores', 'Interiores', false, 10, 'pintar cuarto sala pared'),
  ('pintura', 'departamento', 'Casa o departamento completo', false, 20, 'pintar casa entera'),
  ('pintura', 'exteriores', 'Fachadas y exteriores', false, 30, 'fachada frontis exterior altura'),
  ('pintura', 'acabados', 'Empastado y acabados', false, 40, 'empaste lijado masilla'),
  ('pintura', 'humedad', 'Humedad y salitre', false, 50, 'salitre moho humedad'),
  ('pintura', 'impermeabilizacion', 'Impermeabilización de techos y muros', false, 60, 'impermeabilizar techo gotera'),
  ('pintura', 'puertas-rejas', 'Puertas y rejas', false, 70, 'reja metal anticorrosivo esmalte'),
  ('pintura', 'pintura-muebles', 'Pintura de muebles', false, 80, 'mueble laca pintar madera'),
  ('pintura', 'texturas', 'Texturas y papel tapiz', false, 90, 'tapiz textura decorativo'),
  ('albanileria', 'muros', 'Muros y tarrajeo', false, 10, 'pared tarrajeo ladrillo'),
  ('albanileria', 'enchapes', 'Pisos y enchapes', false, 20, 'mayólica cerámico porcelanato piso'),
  ('albanileria', 'banos', 'Remodelación de baños', false, 30, 'baño remodelar ducha'),
  ('albanileria', 'contrapisos', 'Contrapisos y veredas', false, 40, 'contrapiso vereda cemento'),
  ('albanileria', 'grietas', 'Grietas y fisuras', false, 50, 'rajadura grieta fisura'),
  ('albanileria', 'drywall', 'Drywall y falso techo', false, 60, 'drywall baldosa falso techo'),
  ('albanileria', 'cercos', 'Cercos y muros perimétricos', false, 70, 'cerco muro perimétrico'),
  ('albanileria', 'techos', 'Techos y losas', true, 80, 'techo losa aligerado vaciado'),
  ('albanileria', 'ampliaciones', 'Ampliaciones y segundo piso', true, 90, 'ampliación segundo piso construcción'),
  ('limpieza', 'casa', 'Limpieza de casa', false, 10, 'limpiar casa departamento'),
  ('limpieza', 'profunda', 'Limpieza profunda', false, 20, 'limpieza a fondo general'),
  ('limpieza', 'oficina', 'Limpieza de oficina', false, 30, 'oficina local negocio'),
  ('limpieza', 'post-obra', 'Limpieza después de obra', false, 40, 'post obra construcción polvo'),
  ('limpieza', 'limpieza-mudanza', 'Limpieza por mudanza', false, 50, 'mudanza entrega departamento'),
  ('limpieza', 'muebles-alfombras', 'Muebles, alfombras y colchones', false, 60, 'sofá alfombra colchón tapiz'),
  ('limpieza', 'vidrios', 'Ventanas y vidrios', false, 70, 'vidrio ventana mampara'),
  ('limpieza', 'cocina', 'Cocina y campana', false, 80, 'cocina grasa campana extractora'),
  ('limpieza', 'ropa', 'Lavado y planchado de ropa', false, 90, 'ropa planchar lavar'),
  ('cuidado', 'adulto-mayor', 'Adulto mayor', false, 10, 'abuelo abuela anciano'),
  ('cuidado', 'ninos', 'Niños', false, 20, 'niñera bebé'),
  ('cuidado', 'enfermos', 'Personas enfermas', true, 30, 'enfermo enfermera'),
  ('cuidado', 'postoperatorio', 'Cuidado postoperatorio', true, 40, 'operación cirugía recuperación'),
  ('cuidado', 'discapacidad', 'Personas con discapacidad', false, 50, 'silla de ruedas'),
  ('cuidado', 'nocturno', 'Cuidado nocturno', false, 60, 'noche amanecida'),
  ('cuidado', 'citas', 'Acompañamiento a citas médicas', false, 70, 'hospital clínica cita médico'),
  ('cuidado', 'cuidado-por-horas', 'Cuidado por horas', false, 80, 'horas turno'),
  ('cuidado', 'tareas', 'Apoyo en tareas escolares', false, 90, 'tareas colegio'),
  ('chofer', 'particular', 'Chofer particular', false, 10, 'auto conducir manejar'),
  ('chofer', 'chofer-por-horas', 'Chofer por horas', false, 20, 'horas manejar'),
  ('chofer', 'aeropuerto', 'Traslados al aeropuerto o terminal', false, 30, 'aeropuerto terminal bus viaje'),
  ('chofer', 'compras', 'Compras y encargos', false, 40, 'mandados encargos mercado'),
  ('chofer', 'mudanza', 'Mudanzas y fletes', false, 50, 'flete carga mudanza'),
  ('chofer', 'eventos', 'Eventos y salidas', false, 60, 'fiesta evento noche'),
  ('chofer', 'adultos-mayores', 'Traslado de adultos mayores', false, 70, 'abuelo cita médica'),
  ('chofer', 'interprovincial', 'Viajes interprovinciales', false, 80, 'lima jauja tarma provincia'),
  ('chofer', 'escolar', 'Movilidad escolar', true, 90, 'colegio niños movilidad')
) v (trade_slug, slug, name, risky, sort, terms) on v.trade_slug = t.slug
on conflict (trade_id, slug) do update
  set requires_review = excluded.requires_review, sort_order = excluded.sort_order,
      search_terms = excluded.search_terms;

-- ═════════════ Trabajos de cada profesional: los de riesgo se aprueban aparte ═════════════
-- included = sigue la aprobación del oficio · pending/approved/rejected = trabajo de riesgo revisado aparte.
alter table public.pro_trade_specialties
  add column status text not null default 'included'
    check (status in ('included', 'pending', 'approved', 'rejected')),
  add column reason text check (char_length(reason) <= 300),
  add column reviewed_by uuid references public.profiles (id),
  add column reviewed_at timestamptz;
create index on public.pro_trade_specialties (reviewed_by);
-- Los trabajos de riesgo ya elegidos esperan su revisión: ninguno queda aprobado solo.
update public.pro_trade_specialties pts set status = 'pending'
from public.trade_specialties ts
where ts.id = pts.specialty_id and ts.requires_review;

-- Igual que antes, pero conserva el estado de los trabajos que se mantienen.
create or replace function public.set_pro_trade_specialties(p_pro_trade uuid, p_specialties smallint[])
returns void
language plpgsql security definer set search_path = '' as $$
declare v public.pro_trades;
begin
  select * into v from public.pro_trades where id = p_pro_trade and pro_id = (select auth.uid()) for update;
  if not found then
    raise exception 'Oficio no encontrado' using errcode = 'P0002';
  end if;
  if v.status not in ('draft', 'needs_info') then
    raise exception 'Este oficio ya fue enviado' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_specialties, '{}')) s (id)
    where not exists (
      select 1 from public.trade_specialties ts where ts.id = s.id and ts.trade_id = v.trade_id and ts.active
    )
  ) then
    raise exception 'Esa especialidad no es de este oficio' using errcode = '22023';
  end if;
  delete from public.pro_trade_specialties
  where pro_trade_id = p_pro_trade and specialty_id <> all (coalesce(p_specialties, '{}'));
  insert into public.pro_trade_specialties (pro_trade_id, specialty_id, status)
  select distinct p_pro_trade, ts.id, case when ts.requires_review then 'pending' else 'included' end
  from unnest(coalesce(p_specialties, '{}')) s (id)
  join public.trade_specialties ts on ts.id = s.id
  on conflict (pro_trade_id, specialty_id) do nothing;
end $$;

-- ¿El profesional puede recibir pedidos de este trabajo? Sin trabajo elegido: sí. De riesgo: solo con
-- ese trabajo aprobado. Los demás: sí, salvo que soporte se lo haya rechazado.
create function private.pro_specialty_ok(p_pro uuid, p_specialty smallint) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_specialty is null then true
    when (select ts.requires_review from public.trade_specialties ts where ts.id = p_specialty) then exists (
      select 1 from public.pro_trade_specialties pts
      join public.pro_trades pt on pt.id = pts.pro_trade_id
      where pt.pro_id = p_pro and pts.specialty_id = p_specialty and pts.status = 'approved'
    )
    else not exists (
      select 1 from public.pro_trade_specialties pts
      join public.pro_trades pt on pt.id = pts.pro_trade_id
      where pt.pro_id = p_pro and pts.specialty_id = p_specialty and pts.status = 'rejected'
    )
  end
$$;
grant execute on function private.pro_specialty_ok(uuid, smallint) to authenticated;

-- Soporte decide cada trabajo de riesgo de un profesional (con motivo si lo rechaza).
create function public.review_pro_specialty(
  p_pro_trade uuid, p_specialty smallint, p_decision text, p_reason text default null
) returns public.pro_trade_specialties
language plpgsql security definer set search_path = '' as $$
declare
  v public.pro_trade_specialties;
  v_reason text := nullif(btrim(p_reason), '');
  v_pro uuid;
  v_name text;
begin
  if not public.is_staff() then
    raise exception 'Solo soporte puede revisar trabajos' using errcode = '42501';
  end if;
  select * into v from public.pro_trade_specialties
  where pro_trade_id = p_pro_trade and specialty_id = p_specialty for update;
  if not found then
    raise exception 'Ese trabajo no está en el oficio' using errcode = 'P0002';
  end if;
  if v.status = 'included' then
    raise exception 'Este trabajo no necesita aprobación aparte' using errcode = 'P0001';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'Decisión inválida: %', p_decision using errcode = '22023';
  end if;
  if p_decision = 'reject' and v_reason is null then
    raise exception 'El motivo es obligatorio para rechazar' using errcode = '22023';
  end if;
  update public.pro_trade_specialties
  set status = case p_decision when 'approve' then 'approved' else 'rejected' end,
      reason = case when p_decision = 'reject' then v_reason end,
      reviewed_by = auth.uid(), reviewed_at = now()
  where pro_trade_id = p_pro_trade and specialty_id = p_specialty
  returning * into v;
  select pt.pro_id, ts.name into v_pro, v_name
  from public.pro_trades pt, public.trade_specialties ts
  where pt.id = p_pro_trade and ts.id = p_specialty;
  perform private.notify(v_pro, 'specialty_review',
    case p_decision when 'approve' then 'Trabajo aprobado: ' else 'Trabajo no aprobado: ' end || v_name,
    case p_decision when 'approve' then 'Ya puedes recibir pedidos de este trabajo.' else v_reason end,
    jsonb_build_object('url', '/registro'));
  return v;
end $$;
revoke execute on function public.review_pro_specialty(uuid, smallint, text, text) from public, anon;
grant execute on function public.review_pro_specialty(uuid, smallint, text, text) to authenticated;

-- ═════════════ Edición del catálogo desde el panel (soporte o administración) ═════════════
create function private.slugify(p text) returns text
language sql immutable set search_path = '' as $$
  select left(btrim(regexp_replace(translate(lower(p), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '-', 'g'), '-'), 60)
$$;

create function public.save_trade_specialty(
  p_id smallint, p_trade smallint, p_name text, p_search_terms text default '',
  p_requires_review boolean default false, p_active boolean default true, p_sort_order smallint default 100
) returns public.trade_specialties
language plpgsql security definer set search_path = '' as $$
declare
  v public.trade_specialties;
  v_old public.trade_specialties;
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_terms text := regexp_replace(btrim(coalesce(p_search_terms, '')), '\s+', ' ', 'g');
  v_slug text;
begin
  if not private.is_support() then
    raise exception 'Solo soporte o administración edita el catálogo' using errcode = '42501';
  end if;
  if char_length(v_name) not between 2 and 60 then
    raise exception 'El nombre debe tener de 2 a 60 letras' using errcode = '22023';
  end if;
  if char_length(v_terms) > 300 then
    raise exception 'Las palabras de búsqueda no pueden pasar de 300 letras' using errcode = '22023';
  end if;

  if p_id is null then
    if not exists (select 1 from public.trades where id = p_trade) then
      raise exception 'Oficio no encontrado' using errcode = 'P0002';
    end if;
    v_slug := private.slugify(v_name);
    if v_slug = '' then
      raise exception 'Usa letras o números en el nombre' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.trade_specialties
      where trade_id = p_trade and (slug = v_slug or lower(name) = lower(v_name))
    ) then
      raise exception 'Ese trabajo ya existe en el oficio' using errcode = '23505';
    end if;
    insert into public.trade_specialties
      (trade_id, slug, name, search_terms, requires_review, active, sort_order, updated_by)
    values (p_trade, v_slug, v_name, v_terms, coalesce(p_requires_review, false),
      coalesce(p_active, true), coalesce(p_sort_order, 100), auth.uid())
    returning * into v;
    return v;
  end if;

  select * into v_old from public.trade_specialties where id = p_id for update;
  if not found then
    raise exception 'Trabajo no encontrado' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.trade_specialties
    where trade_id = v_old.trade_id and id <> p_id and lower(name) = lower(v_name)
  ) then
    raise exception 'Ese trabajo ya existe en el oficio' using errcode = '23505';
  end if;
  update public.trade_specialties
  set name = v_name, search_terms = v_terms,
      requires_review = coalesce(p_requires_review, requires_review),
      active = coalesce(p_active, active), sort_order = coalesce(p_sort_order, sort_order),
      updated_at = now(), updated_by = auth.uid()
  where id = p_id
  returning * into v;
  -- Si cambia el riesgo, los profesionales que ya lo tienen pasan a revisión o dejan de necesitarla.
  if v.requires_review and not v_old.requires_review then
    update public.pro_trade_specialties set status = 'pending', reviewed_by = null, reviewed_at = null
    where specialty_id = p_id and status = 'included';
  elsif not v.requires_review and v_old.requires_review then
    update public.pro_trade_specialties set status = 'included'
    where specialty_id = p_id and status in ('pending', 'approved');
  end if;
  return v;
end $$;
revoke execute on function public.save_trade_specialty(smallint, smallint, text, text, boolean, boolean, smallint)
  from public, anon;
grant execute on function public.save_trade_specialty(smallint, smallint, text, text, boolean, boolean, smallint)
  to authenticated;

-- ═════════════ "Otro trabajo": pedido del profesional, revisado por soporte ═════════════
create table public.specialty_requests (
  id uuid primary key default gen_random_uuid(),
  pro_trade_id uuid not null references public.pro_trades (id) on delete cascade,
  pro_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 3 and 60),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  specialty_id smallint references public.trade_specialties (id),
  reason text check (char_length(reason) <= 300),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.specialty_requests (status, created_at);
create index on public.specialty_requests (pro_trade_id);
create index on public.specialty_requests (pro_id);
create index on public.specialty_requests (specialty_id);
create index on public.specialty_requests (reviewed_by);
create unique index specialty_requests_pending_name
  on public.specialty_requests (pro_trade_id, lower(name)) where status = 'pending';
alter table public.specialty_requests enable row level security;
grant select on public.specialty_requests to authenticated;
create policy "trabajos pedidos: propios o soporte" on public.specialty_requests for select to authenticated
  using (pro_id = (select auth.uid()) or public.is_staff());

create function public.request_specialty(p_pro_trade uuid, p_name text)
returns public.specialty_requests
language plpgsql security definer set search_path = '' as $$
declare
  v_trade public.pro_trades;
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_max int := private.setting_int('custom_specialty_max_pending', 3);
  v public.specialty_requests;
begin
  select * into v_trade from public.pro_trades where id = p_pro_trade and pro_id = (select auth.uid());
  if not found then
    raise exception 'Oficio no encontrado' using errcode = 'P0002';
  end if;
  if v_trade.status in ('rejected', 'suspended') then
    raise exception 'Este oficio no está activo' using errcode = 'P0001';
  end if;
  if char_length(v_name) not between 3 and 60 then
    raise exception 'Describe el trabajo con 3 a 60 letras' using errcode = '22023';
  end if;
  if private.chat_violation(v_name) is not null then
    raise exception 'Escribe solo el nombre del trabajo, sin teléfonos, correos ni redes' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.trade_specialties ts
    where ts.trade_id = v_trade.trade_id and ts.active and lower(ts.name) = lower(v_name)
  ) then
    raise exception 'Ese trabajo ya está en la lista: búscalo y márcalo' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.specialty_requests r
    where r.pro_trade_id = p_pro_trade and r.status = 'pending' and lower(r.name) = lower(v_name)
  ) then
    raise exception 'Ya enviaste ese trabajo: está pendiente de revisión' using errcode = '23505';
  end if;
  if (select count(*) from public.specialty_requests r where r.pro_trade_id = p_pro_trade and r.status = 'pending') >= v_max then
    raise exception 'Ya tienes % trabajos esperando revisión. Espera la respuesta de soporte.', v_max
      using errcode = 'P0001';
  end if;
  insert into public.specialty_requests (pro_trade_id, pro_id, name)
  values (p_pro_trade, v_trade.pro_id, v_name)
  returning * into v;
  return v;
end $$;
revoke execute on function public.request_specialty(uuid, text) from public, anon;
grant execute on function public.request_specialty(uuid, text) to authenticated;

-- Aprobar agrega el trabajo al catálogo (o reutiliza el que ya existe) y al oficio del profesional.
create function public.review_specialty_request(
  p_request uuid, p_decision text, p_name text default null,
  p_requires_review boolean default false, p_reason text default null
) returns public.specialty_requests
language plpgsql security definer set search_path = '' as $$
declare
  v public.specialty_requests;
  v_trade smallint;
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_reason text := nullif(btrim(p_reason), '');
  v_slug text;
  v_specialty smallint;
  v_risky boolean;
begin
  if not public.is_staff() then
    raise exception 'Solo soporte revisa trabajos nuevos' using errcode = '42501';
  end if;
  select * into v from public.specialty_requests where id = p_request for update;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;
  if v.status <> 'pending' then
    raise exception 'Este pedido ya fue revisado' using errcode = 'P0001';
  end if;
  select trade_id into v_trade from public.pro_trades where id = v.pro_trade_id;

  if p_decision = 'reject' then
    if v_reason is null then
      raise exception 'El motivo es obligatorio para rechazar' using errcode = '22023';
    end if;
    update public.specialty_requests
    set status = 'rejected', reason = v_reason, reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_request returning * into v;
    perform private.notify(v.pro_id, 'specialty_request', 'Trabajo no agregado: ' || v.name, v_reason,
      jsonb_build_object('url', '/registro'));
    return v;
  elsif p_decision is distinct from 'approve' then
    raise exception 'Decisión inválida: %', p_decision using errcode = '22023';
  end if;

  if v_name = '' then
    v_name := v.name;
  end if;
  if char_length(v_name) not between 2 and 60 then
    raise exception 'El nombre debe tener de 2 a 60 letras' using errcode = '22023';
  end if;
  v_slug := private.slugify(v_name);
  if v_slug = '' then
    raise exception 'Usa letras o números en el nombre' using errcode = '22023';
  end if;
  select id, requires_review into v_specialty, v_risky from public.trade_specialties
  where trade_id = v_trade and (slug = v_slug or lower(name) = lower(v_name))
  order by (slug = v_slug) desc limit 1;
  if v_specialty is null then
    insert into public.trade_specialties (trade_id, slug, name, requires_review, updated_by)
    values (v_trade, v_slug, v_name, coalesce(p_requires_review, false), auth.uid())
    returning id, requires_review into v_specialty, v_risky;
  else
    update public.trade_specialties set active = true, updated_at = now(), updated_by = auth.uid()
    where id = v_specialty and not active;
  end if;
  -- Soporte ya lo revisó para este profesional: si es de riesgo, queda aprobado.
  insert into public.pro_trade_specialties (pro_trade_id, specialty_id, status, reviewed_by, reviewed_at)
  values (v.pro_trade_id, v_specialty, case when v_risky then 'approved' else 'included' end, auth.uid(), now())
  on conflict (pro_trade_id, specialty_id) do update
    set status = excluded.status, reason = null, reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at;
  update public.specialty_requests
  set status = 'approved', specialty_id = v_specialty, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request returning * into v;
  perform private.notify(v.pro_id, 'specialty_request', 'Trabajo agregado: ' || v_name,
    'Ya está en tu lista y en el catálogo de Cerquita.', jsonb_build_object('url', '/registro'));
  return v;
end $$;
revoke execute on function public.review_specialty_request(uuid, text, text, boolean, text) from public, anon;
grant execute on function public.review_specialty_request(uuid, text, text, boolean, text) to authenticated;

-- ═════════════ Pedidos con trabajo elegido ═════════════
alter table public.jobs add column specialty_id smallint references public.trade_specialties (id);
create index on public.jobs (specialty_id);
grant select (specialty_id) on public.jobs to authenticated;
grant insert (specialty_id) on public.jobs to authenticated;

create function private.check_job_specialty() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.specialty_id is not null and not exists (
    select 1 from public.trade_specialties ts
    where ts.id = new.specialty_id and ts.trade_id = new.trade_id and ts.active
  ) then
    raise exception 'Ese trabajo no es de este oficio' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger check_job_specialty before insert on public.jobs
  for each row execute function private.check_job_specialty();

-- Un pedido de trabajo de riesgo solo lo ven y cotizan quienes tienen ese trabajo aprobado.
create or replace function private.pro_is_eligible_for_job(p_job uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select private.pro_is_eligible(j.trade_id, j.approx_point)
      and private.pro_specialty_ok((select auth.uid()), j.specialty_id)
    from public.jobs j where j.id = p_job
  ), false)
$$;

drop policy "jobs: leer" on public.jobs;
create policy "jobs: leer" on public.jobs for select to authenticated
  using (
    client_id = (select auth.uid())
    or public.is_staff()
    or (status in ('published', 'with_offers')
        and private.pro_is_eligible(trade_id, approx_point)
        and private.pro_specialty_ok((select auth.uid()), specialty_id))
    or private.job_assigned_pro_id(id) = (select auth.uid())
  );

-- Mismas columnas que antes más el trabajo elegido; filtra los de riesgo sin aprobación.
drop function public.nearby_jobs();
create function public.nearby_jobs()
returns table (
  id uuid, trade_id smallint, trade_name text, description text, photos text[],
  offered_price_cents int, distance_m int, created_at timestamptz,
  client_name text, client_rating numeric, my_offer_id uuid, my_offer_status public.offer_status,
  my_offer_price_cents int, pricing_unit public.pricing_unit, units smallint, currency_code char(3),
  video_path text, video_seconds smallint, video_expires_at timestamptz, diagnostic_visit boolean, caution boolean,
  schedule_kind text, scheduled_for timestamptz, specialty_name text
)
language sql stable security definer set search_path = '' as $$
  select j.id, j.trade_id, t.name, j.description, j.photos, j.offered_price_cents,
    private.round_distance(extensions.st_distance(pp.last_point, j.approx_point)),
    j.created_at, private.short_name(p.full_name), private.rating_avg(j.client_id),
    o.id, o.status, o.price_cents, j.pricing_unit, j.units, j.currency_code,
    case when j.video_uploaded_at > now() - make_interval(hours => private.setting_int('temp_media_hours', 48)) then j.video_path end,
    j.video_seconds,
    j.video_uploaded_at + make_interval(hours => private.setting_int('temp_media_hours', 48)),
    j.diagnostic_visit, private.location_caution(j.approx_point), j.schedule_kind, j.scheduled_for,
    ts.name
  from public.jobs j
  join public.trades t on t.id = j.trade_id
  join public.profiles p on p.id = j.client_id
  join public.pro_presence pp on pp.pro_id = (select auth.uid())
  left join public.trade_specialties ts on ts.id = j.specialty_id
  left join public.offers o on o.job_id = j.id and o.pro_id = (select auth.uid())
  where j.status in ('published', 'with_offers')
    and j.client_id <> (select auth.uid())
    and private.pro_is_eligible(j.trade_id, j.approx_point)
    and private.pro_specialty_ok((select auth.uid()), j.specialty_id)
    and not private.is_blocked((select auth.uid()), j.client_id)
    and (o.status is null or o.status <> 'no_show')
  order by 7, j.created_at desc
$$;
revoke execute on function public.nearby_jobs() from public, anon;
grant execute on function public.nearby_jobs() to authenticated;

-- Aviso de pedido nuevo: con el nombre del trabajo y solo a quien puede cotizarlo.
create or replace function private.on_job_published_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_title text;
begin
  select coalesce(ts.name, t.name) into v_title
  from public.trades t
  left join public.trade_specialties ts on ts.id = new.specialty_id
  where t.id = new.trade_id;
  insert into public.notification_outbox (user_id, kind, title, body, data)
  select distinct pt.pro_id, 'job_nearby', 'Nuevo pedido cerca: ' || v_title,
    left(new.description, 80) || ' · ' || private.round_distance(extensions.st_distance(pp.last_point, new.approx_point)) || ' m',
    jsonb_build_object('url', '/solicitudes/' || new.id || '/cotizar', 'job_id', new.id)
  from public.pro_trades pt
  join public.pro_presence pp on pp.pro_id = pt.pro_id
  join public.profiles pr on pr.id = pt.pro_id and pr.deleted_at is null and pr.suspended_at is null
  where pt.trade_id = new.trade_id and pt.status in ('approved_observation', 'approved_full')
    and pp.online and pp.last_point is not null and pt.pro_id <> new.client_id
    and extensions.st_dwithin(pp.last_point, new.approx_point, pp.radius_m)
    and not private.is_blocked(pt.pro_id, new.client_id)
    and private.pro_specialty_ok(pt.pro_id, new.specialty_id);
  return new;
end $$;
