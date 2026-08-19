-- ROLLBACK_101.sql —— 撤销 101_dm_requires_friendship_or_shared_pack.sql
--
-- ⚠️ 未实际执行验证过。
-- 还原成迁移 101 之前的线上定义（2026-08-19 用 pg_get_functiondef 逐字取的）：
-- 非好友只要对方 allow_stranger_dm = true 就能开对话，不要求同群。
--
-- 注意：回滚只放宽规则，不会删掉已经建出来的会话 —— 那些窗口本来就是合法建的。
CREATE OR REPLACE FUNCTION public.create_dm(p_target_id uuid, p_my_identity text, p_target_identity text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_a text; v_b text; v_key text; v_id uuid;
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

  select id into v_id from public.conversations where kind='dm' and dm_key=v_key;
  if v_id is not null then return v_id; end if;

  if not coalesce(
       (select allow_stranger_dm from public.profiles where id = p_target_id),
       true)
     and not exists (
       select 1 from public.friendships
       where status = 'accepted'
         and least(requester_id, addressee_id)    = least(v_uid, p_target_id)
         and greatest(requester_id, addressee_id) = greatest(v_uid, p_target_id))
  then
    raise exception 'This person only accepts messages from people they have added.'
      using errcode = '42501';
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
