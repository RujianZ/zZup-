-- =============================================================================
-- ROLLBACK_69.sql — 撤销 69_travel_welcomed_at.sql
--
-- ⚠️ 这是本轮唯一一个**删列**的回滚：welcomed_at 里的数据会丢失
-- （即"谁在什么时候迎接过宠物"的记录）。这不影响任何业务数据，
-- travel_posts 本身、留言、浏览记录都不受影响。
--
-- ⚠️ 回滚后「Welcome home 点了没用、无限弹回」的死循环会复现，
-- Roam 功能对已经有 returned 帖子的账号会重新变成锁死状态。
-- 前端也要一并切回旧提交（否则会查一个不存在的列，直接报错）。
-- =============================================================================

drop index if exists public.travel_posts_user_open_idx;

alter table public.travel_posts
  drop column if exists welcomed_at;
