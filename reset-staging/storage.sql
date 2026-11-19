insert into storage.buckets (id, name, public) values
  ('event-images', 'event-images', true),
  ('team-documents', 'team-documents', true)
on conflict (id) do nothing;

create policy "Imágenes de partidas públicas" on storage.objects
  for select using (bucket_id = 'event-images');
create policy "Lectura publica de team-documents" on storage.objects
  for select using (bucket_id = 'team-documents');

create policy "Usuarios activos suben imágenes de partidas" on storage.objects
  for insert with check (bucket_id = 'event-images' and auth.role() = 'authenticated' and not is_current_user_blocked());
create policy "Usuarios activos actualizan imágenes de partidas" on storage.objects
  for update using (bucket_id = 'event-images' and auth.role() = 'authenticated' and not is_current_user_blocked());
create policy "Usuarios activos borran imágenes de partidas" on storage.objects
  for delete using (bucket_id = 'event-images' and auth.role() = 'authenticated' and not is_current_user_blocked());

create policy "Admins suben a team-documents" on storage.objects
  for insert with check (bucket_id = 'team-documents' and auth.uid() is not null and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.app_role = any (array['admin','super_admin']) and not profiles.is_blocked));
create policy "Admins borran en team-documents" on storage.objects
  for delete using (bucket_id = 'team-documents' and auth.uid() is not null and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.app_role = any (array['admin','super_admin']) and not profiles.is_blocked));
