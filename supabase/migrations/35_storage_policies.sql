-- =============================================================================
-- 35_storage_policies.sql  (v3 重构)
--
-- 移除 post-images 的策略(posts 树外已删);保留 avatars(头像/宠物头像/二维码)。
-- offer-screenshots 随 29 待定,先保留其桶与策略。
-- 注1:post-images 空桶本身需在 Storage 面板手动删(SQL 禁止直接删 storage 表)。
-- 注2:聊天图片消息(messages.image_url / [+] 上传)的存储桶待建,见 docs/DEFERRED.md #12。
-- =============================================================================

-- 清理旧 policies(含 post-images,撤掉后不再重建)
drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_authenticated_upload" on storage.objects;
drop policy if exists "avatars_owner_update" on storage.objects;
drop policy if exists "avatars_owner_delete" on storage.objects;
drop policy if exists "post_images_public_read" on storage.objects;
drop policy if exists "post_images_authenticated_upload" on storage.objects;
drop policy if exists "post_images_owner_delete" on storage.objects;
drop policy if exists "offer_screenshots_owner_upload" on storage.objects;
drop policy if exists "offer_screenshots_owner_read" on storage.objects;

-- Buckets(只 upsert 要保留的;post-images 不再写入)
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do update set public = true;
insert into storage.buckets (id, name, public) values ('offer-screenshots', 'offer-screenshots', false)
  on conflict (id) do update set public = false;

-- avatars policies(头像 / 宠物头像 / 二维码)
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

-- offer-screenshots policies(.edu 验证;随 29 待定,先保留)
create policy "offer_screenshots_owner_upload"
  on storage.objects for insert
  with check (bucket_id = 'offer-screenshots' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "offer_screenshots_owner_read"
  on storage.objects for select
  using (bucket_id = 'offer-screenshots' and auth.uid()::text = (storage.foldername(name))[1]);
