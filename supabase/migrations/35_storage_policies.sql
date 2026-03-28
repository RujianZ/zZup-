-- 清理旧 policies
drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_authenticated_upload" on storage.objects;
drop policy if exists "avatars_owner_update" on storage.objects;
drop policy if exists "avatars_owner_delete" on storage.objects;
drop policy if exists "post_images_public_read" on storage.objects;
drop policy if exists "post_images_authenticated_upload" on storage.objects;
drop policy if exists "post_images_owner_delete" on storage.objects;
drop policy if exists "offer_screenshots_owner_upload" on storage.objects;
drop policy if exists "offer_screenshots_owner_read" on storage.objects;
-- Buckets
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do update set public = true;
insert into storage.buckets (id, name, public) values ('post-images', 'post-images', true) on conflict (id) do update set public = true;
insert into storage.buckets (id, name, public) values ('offer-screenshots', 'offer-screenshots', false) on conflict (id) do update set public = false;
-- avatars policies
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');
create policy "avatars_authenticated_upload"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "avatars_owner_update"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "avatars_owner_delete"
  on storage.objects for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
-- post-images policies
create policy "post_images_public_read"
  on storage.objects for select
  using (bucket_id = 'post-images');
create policy "post_images_authenticated_upload"
  on storage.objects for insert
  with check (bucket_id = 'post-images' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "post_images_owner_delete"
  on storage.objects for delete
  using (bucket_id = 'post-images' and auth.uid()::text = (storage.foldername(name))[1]);
-- offer-screenshots policies
create policy "offer_screenshots_owner_upload"
  on storage.objects for insert
  with check (bucket_id = 'offer-screenshots' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "offer_screenshots_owner_read"
  on storage.objects for select
  using (bucket_id = 'offer-screenshots' and auth.uid()::text = (storage.foldername(name))[1]);
