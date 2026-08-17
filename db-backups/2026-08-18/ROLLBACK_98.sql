-- ROLLBACK_98.sql —— 撤销 98_drop_unhide_message.sql
--
-- 下面是删除前从线上 pg_get_functiondef 原样拉下来的定义（2026-08-18），
-- 直接执行即可完全恢复。
--
-- ⚠️ 恢复这个函数**不会**让功能回来 —— 客户端从来没有接过它，
--    要真做「取消隐藏」还得写 UI。见 docs/_local/冗余与垃圾排查_2026-08-18.md §3.3。

CREATE OR REPLACE FUNCTION public.unhide_message_for_me(p_message uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  delete from public.hidden_messages
   where account_id = auth.uid() and message_id = p_message;
$function$;

-- 迁移 94 当时给它的授权（如果需要一并恢复，查一下当时的 grant）：
-- grant execute on function public.unhide_message_for_me(uuid) to authenticated;
