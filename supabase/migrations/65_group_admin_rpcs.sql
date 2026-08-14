-- =============================================================================
-- 65_group_admin_rpcs.sql
-- 群聊管理修复：踢人 RPC + 群主移交时同步 role
--
-- 问题 1（踢人是假功能）
--   GroupMembersScreen 给群主渲染了「Remove」按钮，走的是客户端
--   `from('conversation_members').delete()`。但 conversation_members 对
--   authenticated **只有 SELECT**（见迁移 27），DELETE 必然被拒 —— 踢人从来没成功过。
--   契约文档 §6 也把「群聊移除成员 RPC」列为未做项。此处补上。
--
-- 问题 2（群主移交后没人是管理员）
--   「谁是群主」有两个来源：conversations.created_by 与 conversation_members.role。
--   leave_group 在创建者退群时只改了 created_by，没把继任者的 role 升为 'admin'，
--   而前端判断管理员用的是 role —— 于是新群主拿不到任何管理权限。
--   这里让 leave_group 两边一起更新，消除不一致。
--
-- 纯函数改动：不动表结构/数据/RLS，也不碰 Edge Function。
-- members_count 由 conversation_members 上的 on_member_delete 触发器维护，无需手动改。
--
-- 回滚：db-backups/2026-08-13/ROLLBACK_65.sql
-- =============================================================================

-- ── 1. 踢人（仅群主，且只能踢群聊里的别人）───────────────────────────────────
create or replace function public.remove_group_member(
  p_conversation_id uuid,
  p_account_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid(); v_kind text; v_owner uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_account_id = v_uid then
    raise exception 'Use leave_group to remove yourself';
  end if;

  select kind, created_by into v_kind, v_owner
  from public.conversations where id = p_conversation_id;

  if v_kind is null then raise exception 'Conversation not found'; end if;
  if v_kind <> 'group' then raise exception 'Only group members can be removed'; end if;
  if v_owner <> v_uid then raise exception 'Only the group owner can remove members'; end if;

  delete from public.conversation_members
  where conversation_id = p_conversation_id and account_id = p_account_id;

  if not found then raise exception 'That person is not a member of this group'; end if;
end;
$function$;

grant execute on function public.remove_group_member(uuid, uuid) to authenticated;

-- ── 2. leave_group：移交群主时同步把继任者的 role 升为 admin ────────────────
create or replace function public.leave_group(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
      -- 新增：让 role 与 created_by 保持一致，否则前端的 isAdmin 判断会失效
      update public.conversation_members set role = 'admin'
      where conversation_id = p_conversation_id and account_id = v_next;
    end if;
  end if;
end;
$function$;

grant execute on function public.leave_group(uuid) to authenticated;

notify pgrst, 'reload schema';
