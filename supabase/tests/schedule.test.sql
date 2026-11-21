-- Recordatorios de pedidos programados: una vez por pedido, antes de la hora, a quien corresponde.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);
delete from public.trade_rate_cards;
set local client_min_messages = warning;

\set a '\'ab000000-0000-0000-0000-000000000001\'::uuid'
\set p '\'ab000000-0000-0000-0000-000000000003\'::uuid'
insert into auth.users (id, phone, aud, role) values
  (:a, '51971000001', 'authenticated', 'authenticated'),
  (:p, '51971000003', 'authenticated', 'authenticated');
\set gas '(select id from public.trades where slug = ''gasfiteria'')'

-- Crea un pedido con su programación y lo deja en el estado pedido
create function pg_temp.job(p_kind text, p_in interval, p_created_ago interval, p_status public.job_status)
returns uuid language plpgsql as $$
declare v uuid; v_offer uuid;
begin
  insert into public.jobs (client_id, trade_id, description, offered_price_cents, approx_point, exact_address,
    schedule_kind, scheduled_for)
  values ('ab000000-0000-0000-0000-000000000001', (select id from public.trades where slug = 'gasfiteria'),
    'Pedido programado', 8000, 'SRID=4326;POINT(-75.2100 -12.0650)', 'Jr. Real 100',
    p_kind, case when p_kind = 'now' then null else now() + greatest(p_in, interval '1 minute') end)
  returning id into v;
  update public.jobs set created_at = now() - p_created_ago,
    scheduled_for = case when p_kind = 'now' then null else now() + p_in end
  where id = v;
  if p_status in ('with_offers', 'accepted') then
    insert into public.offers (job_id, pro_id, price_cents)
    values (v, 'ab000000-0000-0000-0000-000000000003', 8000) returning id into v_offer;
  end if;
  if p_status = 'accepted' then
    update public.offers set status = 'accepted' where id = v_offer;
    update public.jobs set accepted_offer_id = v_offer where id = v;
  end if;
  update public.jobs set status = p_status where id = v;
  return v;
end $$;

select pg_temp.job('scheduled', interval '45 minutes', interval '2 hours', 'accepted') as j1 \gset
select pg_temp.job('scheduled', interval '30 minutes', interval '3 hours', 'with_offers') as j2 \gset
select pg_temp.job('scheduled', interval '50 minutes', interval '2 hours', 'published') as j3 \gset
select pg_temp.job('scheduled', interval '3 hours', interval '5 hours', 'published') as j4 \gset
select pg_temp.job('scheduled', interval '40 minutes', interval '10 minutes', 'published') as j5 \gset
select pg_temp.job('now', interval '0 minutes', interval '2 hours', 'published') as j6 \gset
select pg_temp.job('scheduled', interval '20 minutes', interval '2 hours', 'cancelled') as j7 \gset
select pg_temp.job('scheduled', interval '-10 minutes', interval '2 hours', 'accepted') as j8 \gset
delete from public.notification_outbox where kind like 'schedule%';

select ok(not has_function_privilege('authenticated', 'private.send_schedule_reminders()', 'execute'),
  'la app no puede disparar recordatorios');
select is((select schedule from cron.job where jobname = 'schedule-reminders'), '*/5 * * * *',
  'corren cada 5 minutos');

select is(private.send_schedule_reminders(), 3, 'avisa los 3 pedidos que entran en la próxima hora');

select is((select title from public.notification_outbox where kind = 'schedule_reminder' and user_id = :a and data ->> 'job_id' = :'j1'),
  'Tu servicio es a las ' || to_char((select scheduled_for from public.jobs where id = :'j1') at time zone 'America/Lima', 'HH24:MI'),
  'el cliente recibe la hora en hora de Lima');
select is((select data ->> 'url' from public.notification_outbox where kind = 'schedule_reminder' and user_id = :p and data ->> 'job_id' = :'j1'),
  '/trabajo/' || :'j1', 'el profesional asignado también, con enlace a su trabajo');
select is((select body from public.notification_outbox where kind = 'schedule_no_pro' and data ->> 'job_id' = :'j2'),
  'Ya tienes ofertas: elige una para asegurar la visita.', 'sin profesional y con ofertas: que elija una');
select is((select body from public.notification_outbox where kind = 'schedule_no_pro' and data ->> 'job_id' = :'j3'),
  'Todavía nadie cotizó. Puedes esperar o subir tu precio.', 'sin ofertas: que espere o suba el precio');
select is((select data ->> 'url' from public.notification_outbox where kind = 'schedule_no_pro' and data ->> 'job_id' = :'j3'),
  '/pedido/' || :'j3' || '/ofertas', 'con enlace a sus ofertas');
select is((select count(*)::int from public.notification_outbox where kind like 'schedule%'), 4,
  '4 avisos: cliente y pro del asignado, y un cliente por cada pedido sin profesional');
select is((select count(*)::int from public.notification_outbox where kind like 'schedule%'
  and data ->> 'job_id' in (:'j4', :'j5', :'j6', :'j7', :'j8')), 0,
  'nada para: dentro de 3 h, publicado ya en la ventana, inmediato, cancelado o con la hora pasada');
select is((select count(*)::int from public.jobs where id in (:'j1', :'j2', :'j3') and schedule_reminded_at is not null), 3,
  'queda marcado cada pedido avisado');

select is(private.send_schedule_reminders(), 0, 'no se repite el aviso');

update public.settings set value = '240' where key = 'schedule_reminder_minutes' and scope = 'global';
select is(private.send_schedule_reminders(), 1, 'con 4 h de anticipación entra el pedido de dentro de 3 h');
select is((select count(*)::int from public.notification_outbox where kind like 'schedule%' and data ->> 'job_id' = :'j5'), 0,
  'el publicado hace 10 min sigue sin aviso (lo acaba de crear)');

select * from finish();
rollback;
