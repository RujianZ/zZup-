-- =============================================================================
-- ROLLBACK_71.sql — 撤销 71_reports.sql
--
-- ⚠️⚠️ 这是所有回滚脚本里**最危险**的一个：会删掉 reports 表，
-- 也就是删掉所有举报记录。这些记录在法律上是证据（涉未成年人内容的举报
-- 依 18 U.S.C. § 2258A 需保存至少一年），**删了不可恢复**。
--
-- 回滚前必须先导出：
--   select * from public.reports;   → 存进 D:\zzup-supabase\backups\
--
-- 桶里的举报截图不会被这个脚本删除（storage.objects 保留），
-- 但没有了 reports 表就失去了索引，等于变成孤儿文件。
--
-- 只有在 71 本身有严重问题、且确认没有真实举报数据时才执行。
-- =============================================================================

drop function if exists public.submit_report(text, text, text, uuid, text, jsonb, jsonb);

drop policy if exists "report media: owner can upload" on storage.objects;

-- 桶本身不删（删桶会连带删掉里面的文件）。如确需删除，手工执行：
--   delete from storage.objects where bucket_id = 'report-media';
--   delete from storage.buckets where id = 'report-media';

drop table if exists public.reports;

notify pgrst, 'reload schema';
