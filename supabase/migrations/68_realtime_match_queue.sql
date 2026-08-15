-- =============================================================================
-- 68_realtime_match_queue.sql
-- 把 match_queue 加进 Realtime 发布
--
-- 背景（2026-08-14 双设备实测抓到）：
--   zZuPer Pulse 的两边体验完全不对称。
--   · 后发起的人：agent-chat 的 join_match **同步返回** {status:'matched', groupId}，
--     立刻看到「It's a match!」——这条路径根本不经过 Realtime。
--   · 先等待的人：只能靠 lib/api/match.ts 里的 subscribeToMatchResult 监听
--     match_queue 的 UPDATE 事件得知自己被配上了。
--
--   但 `supabase_realtime` 发布里只有 messages 和 friendships（迁移 30 建的），
--   **match_queue 从来没被加进去** —— 它是迁移 60 才建的表，补发布这一步漏了。
--
--   结果：数据库里 try_match_user 确实把等待方 UPDATE 成了 'matched'，
--   但这个变更不推送给任何客户端，等待方的界面就一直转圈到超时。
--
--   自测时不容易发现，因为只要你是「后进来的那个」就一切正常。
--
-- 安全性：match_queue 的 RLS 是 `auth.uid() = user_id`（FOR ALL），
-- Realtime 会按 RLS 过滤，所以只有本人能收到自己那行的变更，不泄露他人排队状态。
--
-- 注意：Realtime 推送仍可能因弱网/切后台丢失，前端另加了 3 秒轮询兜底
-- （TravelModeScreen + lib/api/match.ts 的 getMyMatchStatus），两者互为保险。
--
-- 回滚：db-backups/2026-08-14/ROLLBACK_68.sql
-- =============================================================================

do $$ begin
  alter publication supabase_realtime drop table public.match_queue;
exception when others then null; end $$;

alter publication supabase_realtime add table public.match_queue;
