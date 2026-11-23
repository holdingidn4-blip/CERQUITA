-- F4 · Capacitaciones para profesionales: charlas por ciudad y oficio, asistencia con código (o QR) de un
-- solo uso, cuestionario, certificado y puntos en el libro inmutable `pro_points_entries`.
-- Los puntos suben de nivel y dan prioridad. El canje de premios queda como "próximamente".

insert into public.settings (key, scope, value) values
  ('training_code_window_hours', 'global', '12'),
  ('training_quiz_max_attempts', 'global', '3')
on conflict (key, scope) do nothing;

create table public.trainings (
  id uuid primary key default gen_random_uuid(),
  city_slug text not null check (city_slug ~ '^[a-z0-9-]+$'),
  trade_id smallint references public.trades (id),
  title text not null check (char_length(title) between 5 and 120),
  description text check (char_length(description) <= 1000),
  starts_at timestamptz not null,
  place text not null check (char_length(place) between 3 and 200),
  points int not null default 50 check (points between 0 and 1000),
  pass_pct smallint not null default 70 check (pass_pct between 1 and 100),
  quiz jsonb not null default '[]' check (jsonb_typeof(quiz) = 'array'),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);
create index on public.trainings (city_slug, starts_at desc);
create index on public.trainings (trade_id);
create index on public.trainings (created_by);
alter table public.trainings enable row level security;
-- El cuestionario (con las respuestas) no se expone: se lee con training_quiz().
grant select (id, city_slug, trade_id, title, description, starts_at, place, points, pass_pct, created_at, cancelled_at)
  on public.trainings to authenticated;
create policy "capacitaciones: las ven todos los usuarios" on public.trainings for select to authenticated
  using (true);

create table public.training_codes (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references public.trainings (id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  used_by uuid references public.profiles (id),
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.training_codes (training_id);
create index on public.training_codes (used_by);
alter table public.training_codes enable row level security;
grant select on public.training_codes to authenticated;
create policy "códigos de capacitación: solo soporte" on public.training_codes for select to authenticated
  using (public.is_staff());

create sequence public.training_certificate_seq;

create table public.training_attendance (
  training_id uuid not null references public.trainings (id) on delete cascade,
  pro_id uuid not null references public.profiles (id) on delete cascade,
  code_id uuid not null unique references public.training_codes (id),
  attended_at timestamptz not null default now(),
  quiz_attempts smallint not null default 0,
  quiz_score smallint check (quiz_score between 0 and 100),
  passed_at timestamptz,
  certificate_no text unique,
  primary key (training_id, pro_id)
);
create index on public.training_attendance (pro_id);
alter table public.training_attendance enable row level security;
grant select on public.training_attendance to authenticated;
create policy "asistencia: el propio profesional o soporte" on public.training_attendance for select to authenticated
  using (pro_id = (select auth.uid()) or public.is_staff());

-- Un cuestionario válido: [{ "q": texto, "options": [≥ 2 textos], "answer": índice }]
create function private.quiz_is_valid(p_quiz jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p_quiz) = 'array' and jsonb_array_length(p_quiz) between 1 and 20
    and not exists (
      select 1 from jsonb_array_elements(p_quiz) e
      where jsonb_typeof(e -> 'q') is distinct from 'string'
        or char_length(e ->> 'q') not between 3 and 300
        or jsonb_typeof(e -> 'options') is distinct from 'array'
        or jsonb_array_length(e -> 'options') not between 2 and 6
        or jsonb_typeof(e -> 'answer') is distinct from 'number'
        or (e ->> 'answer')::int not between 0 and jsonb_array_length(e -> 'options') - 1
    )
$$;

create function public.create_training(p_city text, p_trade smallint, p_title text, p_description text,
  p_starts_at timestamptz, p_place text, p_points int, p_pass_pct int, p_quiz jsonb)
returns public.trainings
language plpgsql security definer set search_path = '' as $$
declare
  v public.trainings;
begin
  if not private.is_support() then
    raise exception 'Solo soporte crea capacitaciones' using errcode = '42501';
  end if;
  if not private.quiz_is_valid(p_quiz) then
    raise exception 'Cuestionario inválido: de 1 a 20 preguntas, cada una con 2 a 6 opciones y una correcta'
      using errcode = '22023';
  end if;
  insert into public.trainings (city_slug, trade_id, title, description, starts_at, place, points, pass_pct, quiz, created_by)
  values (p_city, p_trade, btrim(p_title), nullif(btrim(p_description), ''), p_starts_at, btrim(p_place),
    coalesce(p_points, 50), coalesce(p_pass_pct, 70), p_quiz, auth.uid())
  returning * into v;
  return v;
end $$;
revoke execute on function public.create_training(text, smallint, text, text, timestamptz, text, int, int, jsonb) from public, anon;
grant execute on function public.create_training(text, smallint, text, text, timestamptz, text, int, int, jsonb) to authenticated;

-- Códigos de un solo uso (8 caracteres sin 0/O/1/I para dictarlos sin errores); el QR lleva el mismo código.
create function public.create_training_codes(p_training uuid, p_count int) returns setof public.training_codes
language plpgsql security definer set search_path = '' as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_made int := 0;
begin
  if not private.is_support() then
    raise exception 'Solo soporte genera códigos' using errcode = '42501';
  end if;
  if p_count is null or p_count not between 1 and 200 then
    raise exception 'De 1 a 200 códigos por vez' using errcode = '22023';
  end if;
  if not exists (select 1 from public.trainings where id = p_training and cancelled_at is null) then
    raise exception 'Capacitación no encontrada' using errcode = 'P0002';
  end if;
  while v_made < p_count loop
    select string_agg(substr(v_alphabet, 1 + (get_byte(b, i) % 32), 1), '' order by i) into v_code
    from (select extensions.gen_random_bytes(8) as b) r, generate_series(0, 7) i;
    begin
      return query insert into public.training_codes (training_id, code) values (p_training, v_code) returning *;
      v_made := v_made + 1;
    exception when unique_violation then
      null; -- código repetido: se genera otro
    end;
  end loop;
end $$;
revoke execute on function public.create_training_codes(uuid, int) from public, anon;
grant execute on function public.create_training_codes(uuid, int) to authenticated;

-- El profesional registra su asistencia con el código (o el QR) dentro de la ventana de la charla.
create function public.redeem_training_code(p_code text) returns public.training_attendance
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_code public.training_codes;
  v_training public.trainings;
  v_window int := private.setting_int('training_code_window_hours', 12);
  v public.training_attendance;
begin
  if v_uid is null or not exists (select 1 from public.pro_trades where pro_id = v_uid) then
    raise exception 'Las capacitaciones son para profesionales registrados' using errcode = '42501';
  end if;
  select * into v_code from public.training_codes
  where code = upper(regexp_replace(coalesce(p_code, ''), '^cerquita:capacitacion:|[^A-Za-z0-9]', '', 'g'))
  for update;
  if not found then
    raise exception 'Código no válido. Revisa que esté bien escrito.' using errcode = 'P0002';
  end if;
  if v_code.used_at is not null then
    raise exception 'Este código ya se usó. Pide otro al organizador.' using errcode = 'P0001';
  end if;
  select * into v_training from public.trainings where id = v_code.training_id;
  if v_training.cancelled_at is not null then
    raise exception 'Esta capacitación se canceló' using errcode = 'P0001';
  end if;
  if now() < v_training.starts_at - interval '1 hour'
     or now() > v_training.starts_at + make_interval(hours => v_window) then
    raise exception 'El código solo vale el día de la charla' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.training_attendance where training_id = v_training.id and pro_id = v_uid) then
    raise exception 'Ya registraste tu asistencia a esta charla' using errcode = 'P0001';
  end if;
  update public.training_codes set used_by = v_uid, used_at = now() where id = v_code.id;
  insert into public.training_attendance (training_id, pro_id, code_id)
  values (v_training.id, v_uid, v_code.id) returning * into v;
  return v;
end $$;
revoke execute on function public.redeem_training_code(text) from public, anon;
grant execute on function public.redeem_training_code(text) to authenticated;

-- Preguntas sin las respuestas, solo para quien asistió.
create function public.training_quiz(p_training uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('q', e -> 'q', 'options', e -> 'options') order by n), '[]'::jsonb)
  from public.trainings t
  cross join lateral jsonb_array_elements(t.quiz) with ordinality as x(e, n)
  where t.id = p_training
    and exists (select 1 from public.training_attendance a where a.training_id = t.id and a.pro_id = (select auth.uid()))
$$;
revoke execute on function public.training_quiz(uuid) from public, anon;
grant execute on function public.training_quiz(uuid) to authenticated;

-- Corrige el cuestionario; si aprueba, emite el certificado y anota los puntos (una sola vez).
create function public.submit_training_quiz(p_training uuid, p_answers int[])
returns table (score int, passed boolean, certificate_no text, points int, attempts_left int)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_training public.trainings;
  v_att public.training_attendance;
  v_total int;
  v_ok int;
  v_score int;
  v_max int := private.setting_int('training_quiz_max_attempts', 3);
  v_cert text;
begin
  select * into v_att from public.training_attendance where training_id = p_training and pro_id = v_uid for update;
  if not found then
    raise exception 'Primero registra tu asistencia con el código de la charla' using errcode = '42501';
  end if;
  if v_att.passed_at is not null then
    raise exception 'Ya aprobaste esta capacitación' using errcode = 'P0001';
  end if;
  if v_att.quiz_attempts >= v_max then
    raise exception 'Ya usaste tus % intentos. Escríbenos desde Ayuda.', v_max using errcode = 'P0001';
  end if;
  select * into v_training from public.trainings where id = p_training;
  v_total := jsonb_array_length(v_training.quiz);
  if p_answers is null or cardinality(p_answers) <> v_total then
    raise exception 'Responde todas las preguntas' using errcode = '22023';
  end if;
  select count(*) into v_ok
  from jsonb_array_elements(v_training.quiz) with ordinality as x(e, n)
  where (e ->> 'answer')::int = p_answers[n::int];
  v_score := round(v_ok * 100.0 / v_total);
  if v_score >= v_training.pass_pct then
    v_cert := 'CQ-' || to_char(now() at time zone 'America/Lima', 'YYYY') || '-'
      || lpad(nextval('public.training_certificate_seq')::text, 5, '0');
    update public.training_attendance set quiz_attempts = quiz_attempts + 1, quiz_score = v_score,
      passed_at = now(), certificate_no = v_cert
    where training_id = p_training and pro_id = v_uid;
    if v_training.points > 0 then
      perform private.pro_points_post(v_uid, 'training', v_training.points,
        'training:' || p_training || ':' || v_uid, v_training.title);
    end if;
    return query select v_score, true, v_cert, v_training.points, v_max - v_att.quiz_attempts - 1;
  else
    update public.training_attendance set quiz_attempts = quiz_attempts + 1, quiz_score = v_score
    where training_id = p_training and pro_id = v_uid;
    return query select v_score, false, null::text, 0, v_max - v_att.quiz_attempts - 1;
  end if;
end $$;
revoke execute on function public.submit_training_quiz(uuid, int[]) from public, anon;
grant execute on function public.submit_training_quiz(uuid, int[]) to authenticated;

-- Datos del certificado: el propio profesional o soporte (para verificarlo por número).
create function public.training_certificate(p_certificate text)
returns table (certificate_no text, pro_name text, title text, trade_name text, city_slug text,
  starts_at timestamptz, passed_at timestamptz, score int, points int)
language sql stable security definer set search_path = '' as $$
  select a.certificate_no, p.full_name, t.title, tr.name, t.city_slug, t.starts_at, a.passed_at,
    a.quiz_score::int, t.points
  from public.training_attendance a
  join public.trainings t on t.id = a.training_id
  join public.profiles p on p.id = a.pro_id
  left join public.trades tr on tr.id = t.trade_id
  where a.certificate_no = p_certificate and (a.pro_id = (select auth.uid()) or public.is_staff())
$$;
revoke execute on function public.training_certificate(text) from public, anon;
grant execute on function public.training_certificate(text) to authenticated;

-- Soporte cancela una charla (los puntos ya otorgados no se tocan: el libro es inmutable).
create function public.cancel_training(p_training uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_support() then
    raise exception 'Solo soporte cancela capacitaciones' using errcode = '42501';
  end if;
  update public.trainings set cancelled_at = now() where id = p_training and cancelled_at is null;
  if not found then
    raise exception 'Capacitación no encontrada o ya cancelada' using errcode = 'P0002';
  end if;
end $$;
revoke execute on function public.cancel_training(uuid) from public, anon;
grant execute on function public.cancel_training(uuid) to authenticated;
