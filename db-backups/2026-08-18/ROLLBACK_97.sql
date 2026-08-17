-- ROLLBACK_97.sql —— 撤销 97_drop_dead_offer_feature_and_buckets.sql
--
-- ⚠️ 这份回滚只能恢复「结构」，恢复不了数据 —— 但删的时候 offer_verifications 是 0 行，
--    三个桶都是 0 对象，所以没有数据可丢。

-- ── 1. 重建 offer_verifications 表 ──
-- 迁移前的定义（2026-08-18 从线上 pg_dump 记录）：
create table if not exists public.offer_verifications (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id) on delete cascade,
  screenshot_url    text,
  status            text default 'pending',
  created_at        timestamptz default now()
);
alter table public.offer_verifications enable row level security;
-- ⚠️ 原表的确切列定义如果需要精确恢复，看 db-backups/2026-08-16/ 的全量备份。
--    上面是按用途重建的近似结构 —— 这个功能本来就没上线过，0 行数据。

-- ── 2. 重建三个桶的存储策略 ──
-- 注意：桶本身如果已经在后台删掉了，得先在后台把桶建回来，这些策略才有意义。
create policy "avatars_public_read"
  on storage.objects for select to public
  using (bucket_id = 'avatars');

create policy "avatars_authenticated_upload"
  on storage.objects for insert to public
  with check (bucket_id = 'avatars' and (auth.uid())::text = (storage.foldername(name))[1]);

create policy "avatars_owner_update"
  on storage.objects for update to public
  using (bucket_id = 'avatars' and (auth.uid())::text = (storage.foldername(name))[1]);

create policy "avatars_owner_delete"
  on storage.objects for delete to public
  using (bucket_id = 'avatars' and (auth.uid())::text = (storage.foldername(name))[1]);

create policy "offer_screenshots_owner_read"
  on storage.objects for select to public
  using (bucket_id = 'offer-screenshots' and (auth.uid())::text = (storage.foldername(name))[1]);

create policy "offer_screenshots_owner_upload"
  on storage.objects for insert to public
  with check (bucket_id = 'offer-screenshots' and (auth.uid())::text = (storage.foldername(name))[1]);

-- ── 3. 桶 ──
-- 迁移前状态：
--   avatars            public=true   file_size_limit=null  mime=null
--   post-images        public=true   file_size_limit=null  mime=null
--   offer-screenshots  public=false  file_size_limit=null  mime=null
-- 桶不能用 SQL 建/删（storage.protect_delete()），要在 Supabase 后台 Storage 页面操作。
