-- 101_dm_requires_friendship_or_shared_pack.sql
-- 群友之间可以直接私聊；非好友之间的私聊收窄成「必须同在一个 Pack 里」。
--
-- 已于 2026-08-19 应用到云端。回滚：db-backups/2026-08-19/ROLLBACK_101.sql
--
-- 背景：界面上「Message」按钮原本只在**已经是好友**时才出现，所以群友之间
-- 没法私聊（Joe 2026-08-19 提出）。而服务端的 create_dm 其实比界面宽 ——
-- 只要对方 allow_stranger_dm = true，任何人都能开对话（比如从搜索里点进来）。
-- 这一版把两件事一起做了：**放开群友、收窄陌生人**。
--
-- 口径（Joe）：「本质上也不是说临时的，就是没有好友关系而已。可以加好友，
-- 但是只能是群聊里私聊。」—— 所以不引入新的临时会话类型，就是普通 dm。
--
-- 基线是 pg_get_functiondef 拉的线上定义；签名未变，create or replace 不产生重载。
CREATE OR REPLACE FUNCTION public.create_dm(p_target_id uuid, p_my_identity text, p_target_identity text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_a text; v_b text; v_key text; v_id uuid;
  v_is_friend boolean;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_target_id = v_uid then raise exception 'Cannot DM yourself'; end if;
  if p_my_identity not in ('real','pet') or p_target_identity not in ('real','pet')
    then raise exception 'Invalid identity type'; end if;

  if exists (select 1 from public.blocked_users
             where blocker_id=v_uid and blocked_id=p_target_id and blocked_identity_type=p_target_identity)
     or exists (select 1 from public.blocked_users
             where blocker_id=p_target_id and blocked_id=v_uid and blocked_identity_type=p_my_identity)
    then raise exception 'Cannot start conversation'; end if;

  v_a := v_uid::text || ':' || p_my_identity;
  v_b := p_target_id::text || ':' || p_target_identity;
  v_key := case when v_a < v_b then v_a || '|' || v_b else v_b || '|' || v_a end;

  -- 已经存在的窗口直接返回：窗口本身就是「以前允许过」的证据，
  -- 不因为后来解除好友就把历史窗口锁掉（迁移 92 管的是发送，不是入口）
  select id into v_id from public.conversations where kind='dm' and dm_key=v_key;
  if v_id is not null then return v_id; end if;

  v_is_friend := exists (
    select 1 from public.friendships
    where status = 'accepted'
      and least(requester_id, addressee_id)    = least(v_uid, p_target_id)
      and greatest(requester_id, addressee_id) = greatest(v_uid, p_target_id));

  if not v_is_friend then
    -- ① 必须同群。RLS 只让客户端看见自己那一行成员记录，所以这个判断
    --    只能在 SECURITY DEFINER 里做 —— 也正因如此客户端伪造不了。
    if not exists (
      select 1
      from public.conversation_members me
      join public.conversation_members them on them.conversation_id = me.conversation_id
      join public.conversations c on c.id = me.conversation_id
      where c.kind = 'group'
        and me.account_id = v_uid
        and them.account_id = p_target_id)
    then
      raise exception 'You can only message people you have added, or someone from a Pack you are both in.'
        using errcode = '42501';
    end if;

    -- ② 对方的陌生人开关仍然是最终否决权（迁移 90/91/92）
    if not public.accepts_strangers(p_target_id) then
      raise exception 'This person only accepts messages from people they have added.'
        using errcode = '42501';
    end if;
  end if;

  begin
    insert into public.conversations (kind, dm_key, created_by) values ('dm', v_key, v_uid)
      returning id into v_id;
    insert into public.conversation_members (conversation_id, account_id, member_identity)
    values (v_id, v_uid, p_my_identity), (v_id, p_target_id, p_target_identity);
  exception when unique_violation then
    select id into v_id from public.conversations where kind='dm' and dm_key=v_key;
  end;
  return v_id;
end;
$function$;
