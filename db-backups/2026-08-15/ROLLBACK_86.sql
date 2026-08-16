-- =============================================================================
-- ROLLBACK_86.sql — 撤销 86_conversation_addressed_friendship.sql
--
-- ⚠️ 回滚 = 拆掉「按会话寻址」，Pulse 里的加好友会**再次彻底失效**。
--
--    原来的客户端写法是从 conversation_members 找对方的 account_id，
--    但那张表的 RLS 是 `auth.uid() = account_id` —— 只看得见自己那一行，
--    find() 恒为 undefined，点确认静默 return。
--
--    回滚前必须先把客户端改回去，并且**得另外想办法拿到对方 id**：
--      · lib/api/friends.ts   — sendFriendRequestInConversation / getConversationFriendship
--      · lib/api/conversations.ts — getConversationPeerProfile
--      · AgentChatScreen      — 整个 loadChatData / updateFriendship / 加好友
--
--    注意：唯一「合法」的拿 id 途径是 list_conversation_members，
--    但它会返回未接管对手的 account_id —— 拿到 id 就能转手查出真名，
--    **等于把 Pulse 的匿名性作废**。回滚这条要想清楚。
--
-- ⚠️ 同时丢失的还有服务端的两道闸门：
--    · 「冻结后不能再加好友」—— 回滚后只剩客户端把按钮藏起来，改个客户端就绕过
--    · 「对方揭了面具才给真实资料」—— 回滚后这个判断只剩在客户端
--
-- 前置：ROLLBACK_87 已执行。
-- =============================================================================

drop function if exists public.conversation_peer_profile(uuid);
drop function if exists public.send_friend_request_in_conversation(uuid);
drop function if exists public.conversation_friendship_state(uuid);
drop function if exists public.conversation_peer_id(uuid);
