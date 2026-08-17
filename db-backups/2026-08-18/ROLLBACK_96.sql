-- ROLLBACK_96.sql —— 撤销 96_storage_hardening_and_roam_media.sql
--
-- ⚠️ 用之前先确认：roam-media 桶里如果已经有对象，删桶会失败。
--    要么先清空对象，要么只跑下面的「部分回滚」。
--
-- ⚠️ 迁移前的原始状态（2026-08-18 实测记录，回滚就是恢复成这个）：
--      avatars            public=true   file_size_limit=null  mime=null
--      chat-media         public=false  file_size_limit=null  mime=null
--      offer-screenshots  public=false  file_size_limit=null  mime=null
--      post-images        public=true   file_size_limit=null  mime=null
--      report-media       public=false  file_size_limit=null  mime=null
--      roam-media         （不存在）

-- ── 1. 撤掉扩展名强制（这是 RESTRICTIVE 策略，撤掉等于放开所有扩展名）──
drop policy if exists "attachment_extension_whitelist" on storage.objects;

-- ── 2. 撤掉 roam-media 的三条策略 ──
drop policy if exists "roam_media_owner_upload" on storage.objects;
drop policy if exists "roam_media_read"         on storage.objects;
drop policy if exists "roam_media_owner_delete" on storage.objects;

-- ── 3. 恢复桶的大小上限为无限制 ──
update storage.buckets set file_size_limit = null where id in ('chat-media','report-media');

-- ── 4. 删掉 roam-media 桶（桶内必须已清空）──
-- 先看还有没有对象：
--   select count(*) from storage.objects where bucket_id = 'roam-media';
-- 确认为 0 之后再执行：
delete from storage.buckets where id = 'roam-media';

-- ── 5. 删掉两个辅助函数 ──
drop function if exists public.storage_ext_allowed(text, text);
drop function if exists public.upload_ext(text);

-- ── 部分回滚：只想放开扩展名限制、保留 roam-media 桶 ──
-- 只跑第 1 节即可。
