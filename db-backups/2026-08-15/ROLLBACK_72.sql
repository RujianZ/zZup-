-- =============================================================================
-- ROLLBACK_72.sql — 撤销 72_ops_notifications.sql
--
-- 拆掉三个通知触发器和发送器。业务数据完全不受影响 —— 这些触发器只发通知，
-- 不写任何业务表。
--
-- ⚠️ 保留决定：
--   · **不删 pg_net 扩展**。删了会连带影响任何依赖它的东西（含 Ethan 的
--     trigger_agent_chat_reply，虽然它目前也没真正工作）。扩展本身无害，留着。
--     真要删：drop extension pg_net cascade;
--   · **不删 Vault 里的 ops_notify_key**。留着以后重建通知时不用换密钥，
--     也不需要重新配置 Edge Function。
--     真要删：select vault.delete_secret('ops_notify_key');
--   · Edge Function `ops-notify` 需要单独删：supabase functions delete ops-notify
-- =============================================================================

drop trigger if exists on_report_created on public.reports;
drop trigger if exists on_profile_created on public.profiles;
drop trigger if exists on_profile_deleted on public.profiles;

drop function if exists public.trg_notify_report();
drop function if exists public.trg_notify_signup();
drop function if exists public.trg_notify_deletion();
drop function if exists public.notify_ops(text, jsonb);
drop function if exists public.verify_ops_key(text);
