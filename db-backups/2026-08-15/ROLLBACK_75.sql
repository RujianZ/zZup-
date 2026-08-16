-- =============================================================================
-- ROLLBACK_75.sql — 撤销 75_age_gate.sql
--
-- 拆掉 18 岁年龄门槛的触发器。纯函数/触发器操作，不动任何数据。
--
-- ⚠️ 回滚之后，terms.html / privacy.html 里那句
--    "You must be at least 18 years old" 就重新变成不实陈述了。
--    真要回滚，法务文本得跟着改。
-- =============================================================================

drop trigger if exists trg_enforce_minimum_age on public.profiles;
drop function if exists public.enforce_minimum_age();
