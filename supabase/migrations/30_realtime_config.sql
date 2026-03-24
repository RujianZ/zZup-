-- =============================================
-- 30_realtime_config.sql
-- 开启 4 张表的 Realtime
-- =============================================

alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table posts;
alter publication supabase_realtime add table likes;
alter publication supabase_realtime add table comments;
