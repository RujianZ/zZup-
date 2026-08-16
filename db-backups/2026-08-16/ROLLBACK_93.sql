-- =============================================================================
-- ROLLBACK_93.sql — 撤销 93_ai_disclosure_timestamp.sql
--
-- ⚠️ 回滚等于**放弃纽约 GBL §1700 的定期披露合规**（会话开始 + 每 3 小时）。
--    该法 2025-11-05 已生效，AG 执法每日最高 $15,000，且有私人诉权。
--    只有在确定要换一套实现时才跑这个，不要为了"清理一下"跑它。
--
-- 客户端要一起回退：ChatScreen 的 showAiNotice / checkAiDisclosure 会调用一个
-- 不存在的 RPC。touchAiDisclosure() 失败时返回 false（不抛错），所以界面不会崩，
-- 只是那条披露再也不出现 —— **静默失效**，这正是危险的地方。
--
-- 头部那行 `AI companion` 是纯客户端的，不受这个回滚影响，
-- 也不该跟着删：那一条对应加州 SB 243，和本迁移无关。
-- =============================================================================

drop function if exists public.touch_ai_disclosure(uuid);

-- 列保留，不删。理由：
--   1. 删了就丢掉"我们在什么时候告知过谁"的历史记录 —— 那恰恰是被起诉时
--      唯一能自证的东西，比这一列占的空间值钱得多。
--   2. 纯附加列，留着不影响任何现有查询。
-- 确实要彻底清除再执行下面这行：
-- alter table public.conversation_members drop column if exists last_ai_disclosure_at;

notify pgrst, 'reload schema';
