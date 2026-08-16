-- =============================================================================
-- ROLLBACK_80.sql — 撤销 80_anonymous_report_and_block.sql
--
-- 纯附加迁移，回滚只需删掉两个函数。不动任何数据，也不影响
-- submit_report / block_identity 本身。
--
-- ⚠️ 回滚之后，**匿名宠物将无法被举报或拉黑** —— 客户端拿不到它的身份标识
--    （宠物消息的 sender_id 恒为 null），也就没有别的路径可走。
--    裸宠物主页上的举报/拉黑按钮会直接报错。
--    要回滚的话，先把 PetProfileScreen 的这两个按钮一起摘掉。
-- =============================================================================

drop function if exists public.submit_report_by_alias(uuid, text, text, text, jsonb, jsonb);
drop function if exists public.block_pet_by_alias(uuid, text);

notify pgrst, 'reload schema';
