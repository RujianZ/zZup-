-- =============================================================================
-- ROLLBACK_92.sql — 撤销 92_stranger_optout_blocks_existing_dms.sql
--
-- 回滚后：
--   · 开关退回「只拦新开窗口」（迁移 90/91 的语义），已存在的私聊照常收发
--   · 删好友不再隐藏自己这一侧的窗口
--
-- ⚠️ 两件事要一起做，否则界面又变成不实陈述：
--   1. ProfileScreen 的开关副标题和脚注要改回「已有会话不受影响」的说法
--   2. 已经被 remove_friend 隐藏掉的窗口**不会自动恢复** —— 这份脚本不动数据。
--      要恢复某个人的窗口，手工清掉那两列：
--        update public.conversation_members
--           set hidden_at = null, cleared_before = null
--         where account_id = '<uid>' and conversation_id = '<conv>';
--      注意 cleared_before 是「清空聊天记录」共用的列，清掉它会把用户
--      自己主动清过的记录也一并翻出来，先确认再动。
-- =============================================================================

drop trigger if exists on_message_check_stranger on public.messages;
drop function if exists public.trg_block_stranger_sends();

-- remove_friend 还原成线上原版（只删好友，不隐藏会话）。
-- 取自 pg_get_functiondef，参数名 p_friendship_id。
create or replace function public.remove_friend(p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  delete from public.friendships
  where id = p_friendship_id and status = 'accepted'
    and (requester_id = v_uid or addressee_id = v_uid);
  if not found then raise exception 'Friendship not found or not permitted'; end if;
end;
$function$;

grant execute on function public.remove_friend(uuid) to authenticated;

notify pgrst, 'reload schema';
