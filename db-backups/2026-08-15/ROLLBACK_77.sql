-- =============================================================================
-- ROLLBACK_77.sql — 撤销 77_message_read_rpcs.sql
--
-- 删掉新的消息读取 RPC，并把 get_pet_identity / list_conversation_members
-- 恢复成迁移 77 之前的形态。
--
-- ⚠️ 回滚之前必须先把客户端改回直查 —— lib/api/messages.ts 依赖 list_messages
--    和 get_message。只回滚数据库、不回滚客户端的话，聊天记录会全空。
--
-- ⚠️ 如果迁移 78（撤销 profiles 列级授权）已经应用，**必须先回滚 78**，
--    否则客户端改回直查也读不到 profiles。
-- =============================================================================

drop function if exists public.list_messages(uuid, int, timestamptz);
drop function if exists public.get_message(uuid);
drop function if exists public.get_pet_identity(uuid, text);
drop function if exists public.account_by_pet_alias(uuid, text);

-- ── 恢复迁移 73 版本的 get_pet_identity（按账号寻址）─────────────────────────
create or replace function public.get_pet_identity(
  p_context_kind text,
  p_context_id   uuid,
  p_account      uuid
)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare p public.profiles; v_alias text;
begin
  if auth.uid() is null then return null; end if;

  if p_context_kind = 'conversation' then
    if not exists (
      select 1 from public.conversation_members
      where conversation_id = p_context_id and account_id = auth.uid()
    ) then return null; end if;
    if not exists (
      select 1 from public.conversation_members
      where conversation_id = p_context_id and account_id = p_account
    ) then return null; end if;
    v_alias := public.pet_alias(p_context_id, p_account);
  else
    return null;
  end if;

  select * into p from public.profiles where id = p_account;
  if not found or p.deleted_at is not null then return null; end if;

  return json_build_object(
    'alias', v_alias,
    'pet_breed', p.pet_breed,
    'pet_stage', p.pet_stage,
    'label', trim(both ' ' from coalesce(v_alias || ' ', '') ||
             initcap(replace(coalesce(p.pet_breed, 'pet'), '_', ' ')))
  );
end;
$function$;

grant execute on function public.get_pet_identity(text, uuid, uuid) to authenticated;

-- ── 恢复迁移 64 版本的 list_conversation_members（宠物成员给 pet_name）───────
drop function if exists public.list_conversation_members(uuid);
create function public.list_conversation_members(p_conversation_id uuid)
returns table(account_id uuid, member_identity text, role text,
              joined_at timestamptz, display_name text, display_avatar text,
              pet_breed text, pet_stage text)
language sql
security definer
set search_path to 'public'
as $function$
  select
    cm.account_id, cm.member_identity, cm.role, cm.joined_at,
    case when cm.member_identity = 'pet' then p.pet_name else p.real_name end,
    case when cm.member_identity = 'pet' then p.pet_avatar_url else p.avatar_url end,
    case when cm.member_identity = 'pet' then p.pet_breed else null end,
    case when cm.member_identity = 'pet' then p.pet_stage else null end
  from public.conversation_members cm
  join public.profiles p on p.id = cm.account_id
  where cm.conversation_id = p_conversation_id
    and p.deleted_at is null
    and exists (
      select 1 from public.conversation_members me
      where me.conversation_id = p_conversation_id
        and me.account_id = auth.uid()
    )
  order by (cm.role = 'admin') desc, cm.joined_at asc;
$function$;

grant execute on function public.list_conversation_members(uuid) to authenticated;

notify pgrst, 'reload schema';
