-- =============================================================================
-- 83_block_periods_and_unread.sql
-- 拉黑的三个 bug（实测发现）
--
-- ── ① 解除拉黑后，拉黑期间的消息又冒出来了 ─────────────────────────────────
--
-- 现在的过滤看的是「**当前**有没有被拉黑」。解除时 blocked_users 那行直接删掉，
-- 过滤条件随之消失，于是被拉黑期间对方发的每一条都补回来给你看 ——
-- 而这正是你当初拉黑想避免的东西。
--
-- 改成按**区间**判断。blocked_users 的主键是 (拉黑者, 被拉黑者, 身份)，
-- 一个组合只能有一行，记不下「拉黑→解除→再拉黑」的历史，所以另开一张表。
--
-- 规则：
--   · 当前处于拉黑中 → 该身份的消息**全部**隐藏（含拉黑之前的，符合「我不想看到这个人」）
--   · 已解除         → 只隐藏**拉黑期间**发的那些，之前的历史恢复可见
--
-- ── ② 拉黑列表显示宠物真名 ─────────────────────────────────────────────────
--
-- 匿名宠物在列表里显示 pet_name，等于把马甲摘了。改成显示代号 + 在哪拉黑的，
-- 例如「A Dog · me and my bro」。代号是按会话的，所以必须把**当时那个会话**
-- 一起记下来，否则事后没有任何可显示的稳定标识。
--
-- ── ③ 未读数把被拉黑的消息也算进去了 ───────────────────────────────────────
--
-- 表现：Lounge 显示有未读，点进去一条都没有。未读是客户端直接 count(messages)
-- 算的，既不看拉黑也不看「清空聊天记录」。改成 RPC，跟消息读取用同一套过滤。
--
-- 回滚：db-backups/2026-08-15/ROLLBACK_83.sql
-- =============================================================================

-- ── 拉黑区间 ────────────────────────────────────────────────────────────────
create table if not exists public.block_periods (
  id            uuid primary key default gen_random_uuid(),
  blocker_id    uuid not null references public.profiles(id) on delete cascade,
  blocked_id    uuid not null references public.profiles(id) on delete cascade,
  identity_type text not null check (identity_type in ('real','pet')),
  blocked_at    timestamptz not null default now(),
  unblocked_at  timestamptz,          -- null = 仍在拉黑中
  -- 在哪个会话里拉黑的（按代号拉黑时才有）。用于列表展示「A Dog · 某某群」
  via_conversation uuid references public.conversations(id) on delete set null,
  via_alias        text
);

create index if not exists block_periods_lookup
  on public.block_periods (blocker_id, blocked_id, identity_type, blocked_at);

alter table public.block_periods enable row level security;
-- 只经 RPC 读写。直读会暴露 account_id ↔ alias 的对应关系。
revoke all on public.block_periods from anon, authenticated;

-- 回填：已有的拉黑记录各生成一个「仍在拉黑中」的区间
insert into public.block_periods (blocker_id, blocked_id, identity_type, blocked_at)
select b.blocker_id, b.blocked_id, b.blocked_identity_type, b.created_at
from public.blocked_users b
where not exists (
  select 1 from public.block_periods p
  where p.blocker_id = b.blocker_id and p.blocked_id = b.blocked_id
    and p.identity_type = b.blocked_identity_type and p.unblocked_at is null
);

-- ── 判定：这条消息该不该对我隐藏 ────────────────────────────────────────────
create or replace function public.is_message_blocked_for_me(
  p_sender   uuid,
  p_identity text,
  p_sent_at  timestamptz
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.block_periods bp
    where bp.blocker_id = auth.uid()
      and bp.blocked_id = p_sender
      and bp.identity_type = p_identity
      and (
        -- 仍在拉黑中：这个身份的消息一律不看
        bp.unblocked_at is null
        -- 已解除：只藏拉黑期间发的
        or (p_sent_at >= bp.blocked_at and p_sent_at < bp.unblocked_at)
      )
  );
$function$;

grant execute on function public.is_message_blocked_for_me(uuid, text, timestamptz) to authenticated;

-- ── 拉黑 / 解除：同步维护区间 ───────────────────────────────────────────────
create or replace function public.block_identity(p_blocked_id uuid, p_identity_type text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_blocked_id = auth.uid() then
    raise exception 'Cannot block yourself' using errcode = '22023';
  end if;

  insert into public.blocked_users (blocker_id, blocked_id, blocked_identity_type)
  values (auth.uid(), p_blocked_id, p_identity_type)
  on conflict do nothing;

  -- 已经有敞开的区间就不重复开
  if not exists (
    select 1 from public.block_periods
    where blocker_id = auth.uid() and blocked_id = p_blocked_id
      and identity_type = p_identity_type and unblocked_at is null
  ) then
    insert into public.block_periods (blocker_id, blocked_id, identity_type)
    values (auth.uid(), p_blocked_id, p_identity_type);
  end if;
end;
$function$;

grant execute on function public.block_identity(uuid, text) to authenticated;

create or replace function public.unblock_identity(p_blocked_id uuid, p_identity_type text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  delete from public.blocked_users
  where blocker_id = auth.uid() and blocked_id = p_blocked_id
    and blocked_identity_type = p_identity_type;

  -- **不删区间，只封口** —— 拉黑期间的消息从此永久不可见
  update public.block_periods
     set unblocked_at = now()
   where blocker_id = auth.uid() and blocked_id = p_blocked_id
     and identity_type = p_identity_type and unblocked_at is null;
end;
$function$;

grant execute on function public.unblock_identity(uuid, text) to authenticated;

-- ── 按代号拉黑：把会话和代号一起记下来 ──────────────────────────────────────
create or replace function public.block_pet_by_alias(
  p_conversation uuid,
  p_alias        text
)
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

  -- 记下「在哪拉黑的」。列表里要显示「A Dog · 某某群」而不是宠物真名，
  -- 而代号是按会话的 —— 不记会话就没有任何可显示的稳定标识。
  update public.block_periods
     set via_conversation = p_conversation, via_alias = p_alias
   where blocker_id = auth.uid() and blocked_id = v_account
     and identity_type = 'pet' and unblocked_at is null;
end;
$function$;

grant execute on function public.block_pet_by_alias(uuid, text) to authenticated;

-- ── 拉黑列表：宠物显示代号 + 出处，不显示宠物真名 ───────────────────────────
drop function if exists public.list_blocked_identities();
create function public.list_blocked_identities()
returns table(blocked_id uuid, blocked_identity_type text,
              zzup_id text, display_name text, avatar_url text,
              pet_breed text, pet_stage text,
              via_label text, created_at timestamptz)
language sql
security definer
set search_path to 'public'
as $function$
  select
    b.blocked_id,
    b.blocked_identity_type,
    -- 宠物身份不给 zzup_id：那是账号级标识，等于把马甲摘了
    case when b.blocked_identity_type = 'pet' then null else p.zzup_id end,
    case when b.blocked_identity_type = 'pet'
         then coalesce(bp.via_alias || ' ', '') ||
              initcap(replace(coalesce(p.pet_breed, 'pet'), '_', ' '))
         else p.real_name end,
    case when b.blocked_identity_type = 'pet' then null else p.avatar_url end,
    case when b.blocked_identity_type = 'pet' then p.pet_breed else null end,
    case when b.blocked_identity_type = 'pet' then p.pet_stage else null end,
    -- 「在哪拉黑的」，给宠物一个可辨认的出处
    case when b.blocked_identity_type = 'pet'
         then coalesce(c.name, case c.kind when 'petchat' then 'a zZuPer Pulse match'
                                           else 'a chat' end)
         else null end,
    b.created_at
  from public.blocked_users b
  join public.profiles p on p.id = b.blocked_id
  left join lateral (
    select via_alias, via_conversation from public.block_periods x
    where x.blocker_id = b.blocker_id and x.blocked_id = b.blocked_id
      and x.identity_type = b.blocked_identity_type and x.unblocked_at is null
    order by x.blocked_at desc limit 1
  ) bp on true
  left join public.conversations c on c.id = bp.via_conversation
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$function$;

grant execute on function public.list_blocked_identities() to authenticated;

-- ── 未读数：跟消息读取用同一套过滤 ──────────────────────────────────────────
-- p_marks 形如 {"<conversation_id>": "<ISO 时间>"}，是客户端本地的已读标记。
create or replace function public.get_unread_counts(p_marks jsonb default '{}'::jsonb)
returns table(conversation_id uuid, unread int)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select cm.conversation_id,
         count(m.id)::int
  from public.conversation_members cm
  join public.messages m on m.conversation_id = cm.conversation_id
  where cm.account_id = auth.uid()
    and m.sender_id is distinct from auth.uid()
    -- 已读标记之后的才算
    and (p_marks ->> cm.conversation_id::text is null
         or m.created_at > (p_marks ->> cm.conversation_id::text)::timestamptz)
    -- 「清空聊天记录」之前的不算
    and (cm.cleared_before is null or m.created_at > cm.cleared_before)
    -- 被拉黑的不算 —— 这就是「有未读、点进去空的」那个 bug
    and not public.is_message_blocked_for_me(m.sender_id, m.identity_mode, m.created_at)
  group by cm.conversation_id
  having count(m.id) > 0;
$function$;

grant execute on function public.get_unread_counts(jsonb) to authenticated;

notify pgrst, 'reload schema';

-- ── 消息读取改用区间过滤 ────────────────────────────────────────────────────
-- 原来是「当前有没有被拉黑」，解除后拉黑期间的消息会全部补回来。
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
    m.id, m.conversation_id,
    case when m.identity_mode = 'pet' then null else m.sender_id end,
    m.sender_id = auth.uid(),
    m.identity_mode, m.content, m.image_url, m.attachments,
    m.created_at, m.edited_at,
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
    and not public.is_message_blocked_for_me(m.sender_id, m.identity_mode, m.created_at)
  order by m.created_at desc
  limit p_limit;
end;
$function$;

grant execute on function public.list_messages(uuid, int, timestamptz) to authenticated;

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

  if public.is_message_blocked_for_me(m.sender_id, m.identity_mode, m.created_at) then
    return null;
  end if;

  select * into p from public.profiles where id = m.sender_id;
  if m.identity_mode = 'pet' then
    v_alias := public.pet_alias(m.conversation_id, m.sender_id);
  end if;

  return json_build_object(
    'id', m.id, 'conversation_id', m.conversation_id,
    'sender_id', case when m.identity_mode = 'pet' then null else m.sender_id end,
    'is_mine', m.sender_id = auth.uid(),
    'identity_mode', m.identity_mode, 'content', m.content,
    'image_url', m.image_url, 'attachments', m.attachments,
    'created_at', m.created_at, 'edited_at', m.edited_at,
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

notify pgrst, 'reload schema';
