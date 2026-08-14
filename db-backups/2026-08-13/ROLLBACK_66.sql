-- =============================================================================
-- ROLLBACK_66.sql — 撤销 66_list_conversation_members.sql
--
-- 只需删掉新增的函数即可（66 没有改动任何既有对象）。
--
-- ⚠️ 回滚前提醒：删掉这个 RPC 后，群成员列表就没有任何合法数据来源了
-- （conversation_members 的 RLS 只让你看到自己那一行）。前端要一并切回
-- 旧提交，那边有一段「查不到就拿 profiles 前 20 条冒充成员」的兜底，
-- 界面不会空，但显示的是假数据。
-- =============================================================================

drop function if exists public.list_conversation_members(uuid);

notify pgrst, 'reload schema';
