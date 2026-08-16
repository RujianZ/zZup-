-- =============================================================================
-- ROLLBACK_83.sql — 撤销 83_block_periods_and_unread.sql
--
-- ⚠️ 回滚 = 拉黑重新变成「可以时光倒流」的。
--
--    blocked_users 的主键是 (blocker, blocked, identity)，记不了区间。
--    没有 block_periods，解除拉黑之后**对方在拉黑期间发的消息会全部冒出来** ——
--    用户以为那段时间眼不见为净，结果解除的一刻全都补送到眼前。
--
--    同时丢失的还有另外三个出口的过滤（它们都调 is_message_blocked_for_me）：
--      · 未读角标      —— 会重新为被拉黑的消息计数
--      · 会话列表预览  —— 会重新显示被拉黑者的最后一条
--      · list_conversations 的 last_msg（见 ROLLBACK_85，那边单独保留了这个过滤，
--        本脚本会把它依赖的函数删掉，所以**两边必须一起回滚**）
--
-- ⚠️ get_unread_counts 是本迁移新建的，回滚即删除。
--    **客户端 lib/api/unread.ts 会 404**，必须一起改回去。
--
-- ⚠️ 数据丢失：block_periods 表被删，历史拉黑区间**不可恢复**。
--
-- 前置：ROLLBACK_84 已执行。
-- =============================================================================

-- ── 先恢复不依赖 is_message_blocked_for_me 的版本，再删函数 ─────────────────

-- 迁移 81 的 list_messages（简单的 blocked_users 过滤，无区间概念）
create or replace function public.list_messages(
  p_conversation uuid,
  p_limit        int         default 30,
  p_before       timestamptz default null
)
returns table(
  id uuid, conversation_id uuid, sender_id uuid, is_mine boolean,
  identity_mode text, content text, image_url text, attachments jsonb,
  created_at timestamptz, edited_at timestamptz,
  author_name text, author_avatar_url text,
  author_pet_breed text, author_pet_stage text, author_alias text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_cleared timestamptz;
begin
  select cm.cleared_before into v_cleared
  from public.conversation_members cm
  where cm.conversation_id = p_conversation and cm.account_id = auth.uid();

  if not found then return; end if;

  return query
  select
    m.id,
    m.conversation_id,
    case when m.identity_mode = 'pet' then null else m.sender_id end,
    m.sender_id = auth.uid(),
    m.identity_mode,
    m.content,
    m.image_url,
    m.attachments,
    m.created_at,
    m.edited_at,
    case
      when m.identity_mode = 'pet' then
        public.pet_alias(m.conversation_id, m.sender_id) || ' ' ||
        initcap(replace(coalesce(p.pet_breed, 'pet'), '_', ' '))
      else p.real_name
    end,
    case when m.identity_mode = 'pet' then null else p.avatar_url end,
    case when m.identity_mode = 'pet' then p.pet_breed else null end,
    case when m.identity_mode = 'pet' then p.pet_stage else null end,
    case when m.identity_mode = 'pet'
         then public.pet_alias(m.conversation_id, m.sender_id) else null end
  from public.messages m
  left join public.profiles p on p.id = m.sender_id
  where m.conversation_id = p_conversation
    and (v_cleared is null or m.created_at > v_cleared)
    and (p_before is null or m.created_at < p_before)
    and not exists (
      select 1 from public.blocked_users b
      where b.blocker_id = auth.uid()
        and b.blocked_id = m.sender_id
        and b.blocked_identity_type = m.identity_mode
    )
  order by m.created_at desc
  limit p_limit;
end;
$function$;

grant execute on function public.list_messages(uuid, int, timestamptz) to authenticated;

-- 迁移 81 的 get_message
create or replace function public.get_message(p_message uuid)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare m public.messages; p public.profiles; v_cleared timestamptz; v_alias text;
begin
  select * into m from public.messages where id = p_message;
  if not found then return null; end if;

  select cm.cleared_before into v_cleared
  from public.conversation_members cm
  where cm.conversation_id = m.conversation_id and cm.account_id = auth.uid();
  if not found then return null; end if;
  if v_cleared is not null and m.created_at <= v_cleared then return null; end if;

  if exists (
    select 1 from public.blocked_users b
    where b.blocker_id = auth.uid()
      and b.blocked_id = m.sender_id
      and b.blocked_identity_type = m.identity_mode
  ) then return null; end if;

  select * into p from public.profiles where id = m.sender_id;

  if m.identity_mode = 'pet' then
    v_alias := public.pet_alias(m.conversation_id, m.sender_id);
  end if;

  return json_build_object(
    'id', m.id,
    'conversation_id', m.conversation_id,
    'sender_id', case when m.identity_mode = 'pet' then null else m.sender_id end,
    'is_mine', m.sender_id = auth.uid(),
    'identity_mode', m.identity_mode,
    'content', m.content,
    'image_url', m.image_url,
    'attachments', m.attachments,
    'created_at', m.created_at,
    'edited_at', m.edited_at,
    'author_name', case
      when m.identity_mode = 'pet'
        then v_alias || ' ' || initcap(replace(coalesce(p.pet_breed,'pet'),'_',' '))
      else p.real_name end,
    'author_avatar_url', case when m.identity_mode = 'pet' then null else p.avatar_url end,
    'author_pet_breed', case when m.identity_mode = 'pet' then p.pet_breed else null end,
    'author_pet_stage', case when m.identity_mode = 'pet' then p.pet_stage else null end,
    'author_alias', v_alias
  );
end;
$function$;

grant execute on function public.get_message(uuid) to authenticated;

-- 迁移 81 的 list_blocked_identities（直接显示宠物名，无代号标签、无来源）
drop function if exists public.list_blocked_identities();
create function public.list_blocked_identities()
returns table(blocked_id uuid, blocked_identity_type text,
              zzup_id text, real_name text, avatar_url text,
              pet_name text, pet_avatar_url text,
              pet_breed text, pet_stage text, created_at timestamptz)
language sql
security definer
set search_path to 'public'
as $function$
  select b.blocked_id, b.blocked_identity_type,
         p.zzup_id, p.real_name, p.avatar_url,
         p.pet_name, p.pet_avatar_url, p.pet_breed, p.pet_stage,
         b.created_at
  from public.blocked_users b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$function$;

grant execute on function public.list_blocked_identities() to authenticated;

-- 迁移 26 的 block_identity / unblock_identity（无区间记录，解除即删行）
create or replace function public.block_identity(p_blocked_id uuid, p_identity_type text)
returns void language plpgsql security definer set search_path = public as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_blocked_id = v_uid then raise exception 'Cannot block yourself'; end if;
  if p_identity_type not in ('real','pet') then raise exception 'Invalid identity type'; end if;

  insert into public.blocked_users (blocker_id, blocked_id, blocked_identity_type)
  values (v_uid, p_blocked_id, p_identity_type)
  on conflict do nothing;

  if p_identity_type = 'real' then
    delete from public.friendships
    where status in ('pending','accepted')
      and least(requester_id, addressee_id)    = least(v_uid, p_blocked_id)
      and greatest(requester_id, addressee_id) = greatest(v_uid, p_blocked_id);
  end if;
end;
$function$;

grant execute on function public.block_identity(uuid, text) to authenticated;

create or replace function public.unblock_identity(p_blocked_id uuid, p_identity_type text)
returns void language plpgsql security definer set search_path = public as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  delete from public.blocked_users
  where blocker_id = v_uid and blocked_id = p_blocked_id
    and blocked_identity_type = p_identity_type;
end;
$function$;

grant execute on function public.unblock_identity(uuid, text) to authenticated;

-- 迁移 80 的 block_pet_by_alias（不记录 via_conversation / via_alias）
create or replace function public.block_pet_by_alias(p_conversation uuid, p_alias text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_account uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation and account_id = auth.uid()
  ) then
    raise exception 'Not a member of this conversation' using errcode = '42501';
  end if;

  v_account := public.account_by_pet_alias(p_conversation, p_alias);
  if v_account is null then
    raise exception 'Unknown pet in this conversation' using errcode = '22023';
  end if;

  if v_account = auth.uid() then
    raise exception 'Cannot block yourself' using errcode = '22023';
  end if;

  perform public.block_identity(v_account, 'pet');
end;
$function$;

grant execute on function public.block_pet_by_alias(uuid, text) to authenticated;

-- ── 最后删掉本迁移新增的对象 ────────────────────────────────────────────────
drop function if exists public.get_unread_counts(jsonb);
drop function if exists public.is_message_blocked_for_me(uuid, text, timestamptz);
drop table if exists public.block_periods;
