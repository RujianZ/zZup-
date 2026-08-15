-- =============================================================================
-- ROLLBACK_67.sql — 撤销 67_delete_my_account.sql
--
-- 67 只新增一个函数，不动表结构/数据/RLS，删掉即可回滚。
--
-- ⚠️ 注意：回滚后「删除账号」按钮会重新变成报错状态（function does not exist），
-- 这是 App Store / Google Play 的硬阻断项。仅在该函数本身出问题时才回滚。
--
-- ⚠️ 已经被软删除的账号不会因为回滚而恢复 —— 那是数据层的既成事实。
-- 如需恢复某个误删账号（联调阶段），单独执行：
--   update public.profiles set deleted_at = null where id = '<uuid>';
-- 但被抹掉的 real_name / 邮箱 / 生日等 PII 无法找回（这正是删除的意义）。
-- =============================================================================

drop function if exists public.delete_my_account();

notify pgrst, 'reload schema';
