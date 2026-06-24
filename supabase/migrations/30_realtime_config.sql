-- =============================================================================
-- 30_realtime_config.sql  (v3 重构)
--
-- Realtime publication:聊天实时推送。
-- 树外的 posts/likes/comments 已删,移出。
--
-- 注意(匿名 A 方案,见 docs/DEFERRED.md #10):
--   - messages 入 Realtime → 直推的行含 sender_id(真实 account),本期 A 方案接受。
--   - conversations **不入** Realtime:dm_key 形如 "accountA:identity|accountB:identity",
--     直推会把两账号关联整个泄露,比 messages 更严重。会话列表的实时更新改由
--     客户端在收到 message 事件后重新拉取(或后续 B/C 方案的脱敏 broadcast)。
--   - friendships 入 Realtime → RLS 限 requester/addressee 自己,无匿名问题。
-- =============================================================================

do $$ begin alter publication supabase_realtime drop table messages;     exception when others then null; end $$;
do $$ begin alter publication supabase_realtime drop table friendships;  exception when others then null; end $$;

alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table friendships;
