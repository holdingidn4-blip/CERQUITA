-- Piloto Huancayo · valores nuevos de enums.
-- Van en una migración aparte: Postgres no deja usar un valor nuevo en la misma transacción que lo crea.

-- Precio reevaluado en el sitio y aprobado por el cliente (sigue en el domicilio, antes de Terminado).
alter type public.job_status add value if not exists 'price_renegotiated' after 'at_home';

-- Requisitos por categoría de oficio.
alter type public.verification_document_kind add value if not exists 'driver_license';  -- licencia de conducir
alter type public.verification_document_kind add value if not exists 'driver_record';   -- récord de conductor MTC / papeletas SAT
alter type public.verification_document_kind add value if not exists 'police_record';   -- antecedentes policiales
alter type public.verification_document_kind add value if not exists 'criminal_record'; -- antecedentes penales

create type public.trade_category as enum ('technical', 'construction', 'domestic', 'driver');
create type public.pricing_unit as enum ('job', 'hour', 'day');
create type public.materials_provider as enum ('client', 'pro');
create type public.bypass_status as enum ('open', 'dismissed', 'confirmed');
