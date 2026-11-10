-- Fase 2 · Buckets. Todo privado salvo avatares. Rutas: <dueño o pedido>/<archivo>.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('verification', 'verification', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('job-photos', 'job-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Regla 6: DNI, selfie y antecedentes. El profesional sube a su carpeta y no puede leer.
-- Soporte los ve solo con URL firmada desde el servidor, tras public.log_document_access().
create policy "verification: subir a mi carpeta" on storage.objects for insert to authenticated
  with check (bucket_id = 'verification' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Fotos del pedido: sube el cliente; las ve quien puede ver el pedido (RLS de jobs).
create policy "job-photos: subir a mi pedido" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'job-photos'
    and private.job_client_id(private.try_uuid((storage.foldername(name))[1])) = (select auth.uid())
  );
create policy "job-photos: ver si veo el pedido" on storage.objects for select to authenticated
  using (
    bucket_id = 'job-photos'
    and exists (select 1 from public.jobs j where j.id = private.try_uuid((storage.foldername(name))[1]))
  );

create policy "payment-proofs: subir a mi carpeta" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "payment-proofs: ver propias o soporte" on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_staff())
  );

create policy "avatars: subir a mi carpeta" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: reemplazar el mío" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
