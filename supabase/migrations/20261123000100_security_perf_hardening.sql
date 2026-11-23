-- F1 · Endurecimiento según los advisors de Supabase (sin tocar datos):
-- 1) `job_counterpart_phone` siempre devolvía null (el chat es 100 % interno): se retira el permiso.
-- 2) Políticas "edita" FOR ALL se separan por acción: la lectura ya la da otra política, así no hay
--    dos políticas permisivas para SELECT (mismo resultado, menos trabajo por consulta).
-- 3) Índices para las claves foráneas sin índice.

revoke execute on function public.job_counterpart_phone(uuid) from public, anon, authenticated;

-- ───────── materials_catalog (lectura: activos o soporte) ─────────
drop policy "catálogo: admin edita" on public.materials_catalog;
create policy "catálogo: admin agrega" on public.materials_catalog for insert to authenticated
  with check (public.is_admin());
create policy "catálogo: admin cambia" on public.materials_catalog for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "catálogo: admin borra" on public.materials_catalog for delete to authenticated
  using (public.is_admin());

-- ───────── settings (lectura: todos con sesión) ─────────
drop policy "settings: solo admin edita" on public.settings;
create policy "settings: admin agrega" on public.settings for insert to authenticated
  with check (public.is_admin());
create policy "settings: admin cambia" on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "settings: admin borra" on public.settings for delete to authenticated
  using (public.is_admin());

-- ───────── trade_rate_cards (lectura: todos con sesión) ─────────
drop policy "rate cards: admin edita" on public.trade_rate_cards;
create policy "rate cards: admin agrega" on public.trade_rate_cards for insert to authenticated
  with check (public.is_admin());
create policy "rate cards: admin cambia" on public.trade_rate_cards for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "rate cards: admin borra" on public.trade_rate_cards for delete to authenticated
  using (public.is_admin());

-- ───────── trades (lectura pública) ─────────
drop policy "trades: soporte edita" on public.trades;
create policy "trades: soporte agrega" on public.trades for insert to authenticated
  with check (public.is_staff());
create policy "trades: soporte cambia" on public.trades for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "trades: soporte borra" on public.trades for delete to authenticated
  using (public.is_staff());

-- ───────── sos_alerts: una sola política de UPDATE (la propia o soporte) ─────────
drop policy "sos: editar propia" on public.sos_alerts;
drop policy "sos: soporte cierra" on public.sos_alerts;
create policy "sos: editar propia o soporte" on public.sos_alerts for update to authenticated
  using (user_id = (select auth.uid()) or public.is_staff())
  with check (user_id = (select auth.uid()) or public.is_staff());

-- ───────── Índices de claves foráneas ─────────
create index if not exists admin_actions_actor_id_idx on public.admin_actions (actor_id);
create index if not exists admin_actions_target_user_idx on public.admin_actions (target_user);
create index if not exists blacklisted_locations_created_by_idx on public.blacklisted_locations (created_by);
create index if not exists bypass_suspicions_reviewed_by_idx on public.bypass_suspicions (reviewed_by);
create index if not exists chat_flags_job_id_idx on public.chat_flags (job_id);
create index if not exists chat_flags_sender_id_idx on public.chat_flags (sender_id);
create index if not exists claims_client_id_idx on public.claims (client_id);
create index if not exists claims_pro_id_idx on public.claims (pro_id);
create index if not exists claims_resolved_by_idx on public.claims (resolved_by);
create index if not exists document_access_log_viewer_id_idx on public.document_access_log (viewer_id);
create index if not exists job_messages_sender_id_idx on public.job_messages (sender_id);
create index if not exists jobs_accepted_offer_id_idx on public.jobs (accepted_offer_id);
create index if not exists jobs_cancelled_by_idx on public.jobs (cancelled_by);
create index if not exists notification_outbox_user_id_idx on public.notification_outbox (user_id);
create index if not exists payment_proofs_reviewed_by_idx on public.payment_proofs (reviewed_by);
create index if not exists points_entries_job_id_idx on public.points_entries (job_id);
create index if not exists pro_no_shows_job_id_idx on public.pro_no_shows (job_id);
create index if not exists pro_trades_reviewed_by_idx on public.pro_trades (reviewed_by);
create index if not exists ratings_from_id_idx on public.ratings (from_id);
create index if not exists sos_alerts_closed_by_idx on public.sos_alerts (closed_by);
create index if not exists sos_alerts_job_id_idx on public.sos_alerts (job_id);
create index if not exists sos_alerts_user_id_idx on public.sos_alerts (user_id);
create index if not exists support_tickets_job_id_idx on public.support_tickets (job_id);
create index if not exists support_tickets_replied_by_idx on public.support_tickets (replied_by);
create index if not exists support_tickets_user_id_idx on public.support_tickets (user_id);
create index if not exists user_blocks_blocked_id_idx on public.user_blocks (blocked_id);
create index if not exists user_reports_job_id_idx on public.user_reports (job_id);
create index if not exists user_reports_reported_id_idx on public.user_reports (reported_id);
create index if not exists user_reports_reporter_id_idx on public.user_reports (reporter_id);
create index if not exists user_reports_reviewed_by_idx on public.user_reports (reviewed_by);
create index if not exists verification_documents_pro_trade_id_idx on public.verification_documents (pro_trade_id);
create index if not exists wallet_entries_created_by_idx on public.wallet_entries (created_by);
create index if not exists wallet_entries_job_id_idx on public.wallet_entries (job_id);
