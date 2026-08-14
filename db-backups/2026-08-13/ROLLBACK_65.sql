-- =============================================================================
-- ROLLBACK_65.sql — 撤销 65_group_admin_rpcs.sql
--
-- 用法：整份贴进 Supabase SQL Editor 执行。
--   1) 删掉新增的 remove_group_member
--   2) 把 leave_group 还原成改动前的定义（快照取自云端，2026-08-13）
--
-- 65 只改函数，不动表结构/数据/RLS，回滚无损。
-- 回滚后前端也要切回对应提交，否则「Remove」按钮会报 function does not exist。
-- =============================================================================

drop function if exists public.remove_group_member(uuid, uuid);

CREATE OR REPLACE FUNCTION public.leave_group(p_conversation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_was_creator boolean; v_next uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select (created_by = v_uid) into v_was_creator from public.conversations where id = p_conversation_id;
  if v_was_creator is null then return; end if;

  delete from public.conversation_members where conversation_id = p_conversation_id and account_id = v_uid;

  if v_was_creator then
    select account_id into v_next from public.conversation_members
    where conversation_id = p_conversation_id order by joined_at asc limit 1;
    if v_next is not null then
      update public.conversations set created_by = v_next where id = p_conversation_id;
    end if;
  end if;
end; $function$;

grant execute on function public.leave_group(uuid) to authenticated;

notify pgrst, 'reload schema';
