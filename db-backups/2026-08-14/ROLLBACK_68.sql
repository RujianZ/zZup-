-- =============================================================================
-- ROLLBACK_68.sql — 撤销 68_realtime_match_queue.sql
--
-- 把 match_queue 移出 Realtime 发布，恢复到迁移 68 之前的状态
-- （发布里只剩 messages 和 friendships）。
--
-- ⚠️ 回滚后「等待方永远收不到匹配成功通知」的 bug 会复现。
-- 前端的轮询兜底仍然有效（3 秒一次），所以体验不会完全断，只是慢一点。
-- =============================================================================

do $$ begin
  alter publication supabase_realtime drop table public.match_queue;
exception when others then null; end $$;
