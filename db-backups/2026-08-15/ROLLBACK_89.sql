-- =============================================================================
-- ROLLBACK_89.sql — 撤销 89_restore_select_on_profiles_id.sql
--
-- ⚠️ 回滚 = **新用户注册不完**，卡在 onboarding 出不去；老用户也改不了任何资料。
--
--    客户端保存资料是 `update(fields).eq('id', user.id)`，
--    而 Postgres 里 UPDATE ... WHERE 需要 WHERE 引用列的 SELECT 权限。
--    收回 id 的 SELECT 之后，所有写 profiles 的路径一律 42501。
--
--    只有把资料写入改成 SECURITY DEFINER RPC 之后，回滚这条才是安全的。
-- =============================================================================

revoke select (id) on public.profiles from authenticated;
