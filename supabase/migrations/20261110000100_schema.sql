-- Fase 2 · Esquema base de Cerquita (15 tablas). Fuente: docs/documento-tecnico.md
-- Montos en céntimos de sol (int). Nunca decimales para dinero.

create extension if not exists postgis with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ───────────────────────── Tipos ─────────────────────────
create type public.user_role as enum ('client', 'pro');
create type public.job_status as enum (
  'published', 'with_offers', 'accepted', 'on_the_way', 'at_home',
  'finished', 'confirmed', 'rated', 'cancelled'
);
create type public.pro_trade_status as enum (
  'draft', 'submitted', 'in_review', 'needs_info',
  'approved_observation', 'approved_full', 'rejected', 'suspended'
);
create type public.offer_status as enum ('pending', 'accepted', 'rejected', 'withdrawn', 'expired');
create type public.wallet_entry_type as enum (
  'commission_debit', 'payment_credit', 'promo_credit', 'adjustment', 'reversal'
);
create type public.payment_method as enum ('yape', 'plin', 'transfer');
create type public.payment_proof_status as enum ('pending', 'approved', 'rejected');
create type public.sos_status as enum ('countdown', 'open', 'closed', 'cancelled');
create type public.verification_document_kind as enum (
  'dni_front', 'dni_back', 'selfie', 'background', 'work_photo', 'certificate', 'reference', 'quiz'
);

-- ───────────────────────── Utilidades ─────────────────────────
create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Personal de soporte: app_metadata.staff_role, que solo puede fijar el service role.
create function public.is_staff() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'staff_role', '') in ('reviewer', 'support', 'admin')
$$;

-- ───────────────────────── Tablas ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text,
  full_name text check (char_length(full_name) <= 120),
  active_role public.user_role not null default 'client',
  avatar_url text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trades (
  id smallint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  active boolean not null default true
);

create table public.pro_trades (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null references public.profiles (id) on delete cascade,
  trade_id smallint not null references public.trades (id),
  status public.pro_trade_status not null default 'draft',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  reason text,
  good_ratings_count int not null default 0 check (good_ratings_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pro_id, trade_id)
);

create table public.verification_documents (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null references public.profiles (id) on delete cascade,
  pro_trade_id uuid references public.pro_trades (id) on delete cascade,
  kind public.verification_document_kind not null,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create table public.document_access_log (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.verification_documents (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id),
  viewed_at timestamptz not null default now()
);

create table public.pro_presence (
  pro_id uuid primary key references public.profiles (id) on delete cascade,
  online boolean not null default false,
  radius_m int not null default 5000 check (radius_m between 500 and 50000),
  last_point extensions.geography(point, 4326),
  updated_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  trade_id smallint not null references public.trades (id),
  description text not null check (char_length(description) between 1 and 2000),
  photos text[] not null default '{}' check (cardinality(photos) <= 6),
  offered_price_cents int not null check (offered_price_cents > 0),
  approx_point extensions.geography(point, 4326) not null,
  exact_address text not null check (char_length(exact_address) <= 300),
  status public.job_status not null default 'published',
  accepted_offer_id uuid,
  final_price_cents int check (final_price_cents > 0),
  commission_rate_bps int check (commission_rate_bps between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  pro_id uuid not null references public.profiles (id) on delete cascade,
  price_cents int not null check (price_cents > 0),
  message text check (char_length(message) <= 500),
  status public.offer_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (job_id, pro_id)
);

alter table public.jobs
  add constraint jobs_accepted_offer_fk foreign key (accepted_offer_id) references public.offers (id);

create table public.job_tracks (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs (id) on delete cascade,
  point extensions.geography(point, 4326) not null,
  recorded_at timestamptz not null default now()
);

create table public.wallet_entries (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles (id),
  job_id uuid references public.jobs (id),
  type public.wallet_entry_type not null,
  -- Con signo: negativo = deuda del profesional, positivo = abono.
  amount_cents int not null,
  balance_after_cents int not null default 0,
  external_ref text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  constraint wallet_amount_sign check (
    case type
      when 'commission_debit' then amount_cents < 0
      when 'payment_credit' then amount_cents > 0
      when 'promo_credit' then amount_cents > 0
      else amount_cents <> 0
    end
  )
);

create table public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles (id) on delete cascade,
  method public.payment_method not null,
  operation_code text not null check (char_length(operation_code) between 1 and 64),
  amount_cents int not null check (amount_cents > 0),
  image_path text not null,
  status public.payment_proof_status not null default 'pending',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (method, operation_code)
);

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  tags text[] not null default '{}',
  comment text check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  unique (job_id, from_id),
  check (from_id <> to_id)
);

create table public.trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  phone text not null check (phone ~ '^\+?[0-9]{6,15}$'),
  relation text check (char_length(relation) <= 40),
  created_at timestamptz not null default now()
);

create table public.sos_alerts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs (id),
  user_id uuid not null references public.profiles (id),
  status public.sos_status not null default 'countdown',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id),
  note text
);

create table public.settings (
  key text not null,
  -- 'global', 'city:<slug>' o 'trade:<slug>'
  scope text not null default 'global' check (scope ~ '^(global|city:[a-z0-9-]+|trade:[a-z0-9-]+)$'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (key, scope)
);

-- ───────────────────────── Índices ─────────────────────────
create index on public.pro_trades (trade_id, status);
create index on public.verification_documents (pro_id);
create index on public.document_access_log (document_id);
create index on public.pro_presence using gist (last_point) where online;
create index on public.jobs (client_id);
create index on public.jobs (trade_id, status);
create index on public.jobs using gist (approx_point);
create index on public.offers (pro_id);
create index on public.job_tracks (job_id, recorded_at);
create index on public.job_tracks (recorded_at);
create index on public.wallet_entries (professional_id, created_at);
create index on public.payment_proofs (professional_id);
create index on public.ratings (to_id);
create index on public.trusted_contacts (user_id);
create index on public.sos_alerts (status) where status in ('countdown', 'open');

-- ───────────────────────── updated_at ─────────────────────────
create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.pro_trades
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.pro_presence
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.jobs
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.settings
  for each row execute function private.set_updated_at();

-- ───────────────────────── Perfil al registrarse ─────────────────────────
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, phone) values (new.id, new.phone);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();
