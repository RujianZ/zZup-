-- =============================================================================
-- 94_message_author_kind_and_hide.sql
-- 消息来源标记（人 / 宠物马甲 / 两种 AI）+ 按人隐藏单条消息
--
-- 为长按气泡那个菜单（Copy / Remove for me / Report）打底。
--
-- ── 一、为什么必须存成一列，而不是读的时候现算 ───────────────────────────────
-- 举报一条 AI 说的话，和举报一个人说的话，是两件事：前者没有人可以封，
-- 处置是改 prompt。所以系统必须知道每条消息到底是谁说的。
--
-- 但 messages 表里**没有任何 AI 标记**（只有 9 列，没有一列表达这个），
-- 而且两条 AI 链路的写入方式**不一样**，这是查出来才知道的：
--
--   Pulse (agent-chat)      Edge Function 用 supabaseAdmin 直接写库
--                           （agent-chat/index.ts:195）→ auth.uid() 为 null
--   zZuPer Talk (pet-chat)  Edge Function **只把文本流回客户端**，
--                           由 ChatScreen:325 调 sendMessage(...,'pet') 写库
--                           → auth.uid() 是**用户本人**
--
-- 所以「服务端写的就是 AI」这条判据只对 Pulse 成立。zZuPer Talk 靠另一条：
-- 那一屏里用户永远以 'real' 发言（ChatScreen: isDM||isPetTalk ? 'real' : ...），
-- 所以 zzuper_talk 会话里 identity_mode='pet' ⇒ 必然是 AI。
--
-- ⚠️ **不能用 conversations.is_agent_chat 判断**：迁移 87 会在加好友时把它
--    从 true 改成 false。那条 AI 在 3:39 说的话，今天再读会被判成真人说的。
--    会话级的**可变**状态不能用来解释历史消息 —— 这正是要在写入时定死的原因。
--
-- 这个方案**不需要动 Ethan 的任何一行代码**：触发器挂在表上，他照常写他的。
--
-- ── 二、Remove for me 是「按人隐藏」，不是删除 ────────────────────────────────
-- 消息永久保留是这个产品的核心设计，三份已发布文书都写了：
--   privacy.html  "Nobody can delete a sent message — including you."
--   terms.html    "Sent messages cannot be deleted or edited into oblivion."
--   safety.html   "...the evidence is still there when you report it.
--                  That is the entire reason for that design."
-- 所以这里**一行都不删**，只往 hidden_messages 里加一条「我不想看见它」。
-- 举报时服务端照样抓得到原文 —— 隐藏了再举报，证据不受影响。
--
-- 界面上也**不能叫 Delete**：用户会以为自己删掉了对方的消息，实际没有。
-- 叫 "Remove for me"。
--
-- 已有先例：迁移 76 的 cleared_before / hidden_at 就是按成员各存各的隐藏，
-- 这里只是把粒度从「整个会话」做到「单条消息」。
--
-- 回滚：db-backups/2026-08-16/ROLLBACK_94.sql
-- =============================================================================

-- ── 来源标记 ─────────────────────────────────────────────────────────────────
alter table public.messages
  add column if not exists author_kind text
    check (author_kind in ('human','human_pet','ai_pet','ai_proxy'));

comment on column public.messages.author_kind is
  'human=真人真身 / human_pet=真人顶宠物马甲 / ai_pet=zZuPer Talk 的宠物 AI / '
  'ai_proxy=Pulse 的 AI 代聊。写入时由 set_message_author_kind() 定死，'
  '不要在读取时靠 is_agent_chat 现算 —— 那个标志迁移 87 之后会变。';

create or replace function public.set_message_author_kind()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_kind text;
begin
  -- 已经带值的不覆盖（回填、以及将来 Ethan 想显式标注时都用得上）
  if new.author_kind is not null then return new; end if;

  select kind into v_kind from public.conversations where id = new.conversation_id;

  new.author_kind := case
    -- zZuPer Talk 里用户永远以 'real' 发言，所以 pet = 宠物 AI
    when v_kind = 'zzuper_talk' and new.identity_mode = 'pet' then 'ai_pet'
    -- 服务端（service_role）写入 = Pulse 的 AI 代聊
    when auth.uid() is null then 'ai_proxy'
    when new.identity_mode = 'pet' then 'human_pet'
    else 'human'
  end;

  return new;
end;
$function$;

drop trigger if exists on_message_set_author_kind on public.messages;
create trigger on_message_set_author_kind
  before insert on public.messages
  for each row execute function public.set_message_author_kind();

-- ── 回填历史消息 ─────────────────────────────────────────────────────────────
-- 历史行拿不到当时的 auth.uid()，只能按会话类型推断，是**尽力而为**：
--   zzuper_talk + pet → ai_pet   （同上，那一屏用户只以 real 发言）
--   petchat     + pet → ai_proxy （Pulse 接管前只有 AI 说话；接管后是 real）
--   其余        + pet → human_pet
--   real              → human
-- 新消息不走这套推断，走上面的触发器。
update public.messages m
set author_kind = case
  when c.kind = 'zzuper_talk' and m.identity_mode = 'pet' then 'ai_pet'
  when c.kind = 'petchat'     and m.identity_mode = 'pet' then 'ai_proxy'
  when m.identity_mode = 'pet' then 'human_pet'
  else 'human'
end
from public.conversations c
where c.id = m.conversation_id and m.author_kind is null;

-- ── 按人隐藏单条消息 ─────────────────────────────────────────────────────────
create table if not exists public.hidden_messages (
  account_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  hidden_at  timestamptz not null default now(),
  primary key (account_id, message_id)
);

comment on table public.hidden_messages is
  '「Remove for me」：某人不想再看到某条消息。消息本体一行不删 —— '
  '证据保全是这个产品的核心设计，见 privacy/terms/safety 三份文书。';

create index if not exists hidden_messages_account_idx
  on public.hidden_messages (account_id);

alter table public.hidden_messages enable row level security;
revoke all on public.hidden_messages from anon, authenticated;
-- 只走下面的 RPC，不开表权限：直接开表的话客户端能拿别人的隐藏列表去做行为分析。

create or replace function public.hide_message_for_me(p_message uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;

  -- 必须是这条消息所在会话的成员。少了这一步，任何人拿到一个 message_id
  -- 就能往表里写行 —— 虽然只影响他自己的视图，但那是一条可以用来
  -- **探测某个 message_id 是否存在**的信道。
  if not exists (
    select 1
    from public.messages m
    join public.conversation_members cm on cm.conversation_id = m.conversation_id
    where m.id = p_message and cm.account_id = v_uid
  ) then
    raise exception 'Message not found' using errcode = '42501';
  end if;

  insert into public.hidden_messages (account_id, message_id)
  values (v_uid, p_message)
  on conflict do nothing;
end;
$function$;

create or replace function public.unhide_message_for_me(p_message uuid)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  delete from public.hidden_messages
   where account_id = auth.uid() and message_id = p_message;
$function$;

grant execute on function public.hide_message_for_me(uuid)   to authenticated;
grant execute on function public.unhide_message_for_me(uuid) to authenticated;

-- ── 读取 RPC：返回 author_kind，并过滤掉我隐藏的 ─────────────────────────────
-- 返回签名变了，必须 DROP + CREATE。函数体取自 pg_get_functiondef 线上原文，
-- 只加 author_kind 一列和 hidden_messages 一个 not exists。
drop function if exists public.list_messages(uuid, integer, timestamptz);
create function public.list_messages(
  p_conversation uuid,
  p_limit integer default 30,
  p_before timestamp with time zone default null
)
returns table(
  id uuid, conversation_id uuid, sender_id uuid, is_mine boolean,
  identity_mode text, content text, image_url text, attachments jsonb,
  created_at timestamp with time zone, edited_at timestamp with time zone,
  author_name text, author_avatar_url text, author_pet_breed text,
  author_pet_stage text, author_alias text,
  author_kind text
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
         then public.pet_alias(m.conversation_id, m.sender_id) else null end,
    m.author_kind
  from public.messages m
  left join public.profiles p on p.id = m.sender_id
  where m.conversation_id = p_conversation
    and (v_cleared is null or m.created_at > v_cleared)
    and (p_before is null or m.created_at < p_before)
    and not public.is_message_blocked_for_me(m.sender_id, m.identity_mode, m.created_at)
    and not exists (select 1 from public.hidden_messages h
                    where h.message_id = m.id and h.account_id = auth.uid())
  order by m.created_at desc
  limit p_limit;
end;
$function$;

grant execute on function public.list_messages(uuid, integer, timestamptz) to authenticated;

-- get_message 返回的是 json，加字段不用改签名。
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

  -- 迁移 94：我隐藏过的消息，Realtime 推过来也不该再冒出来
  if exists (select 1 from public.hidden_messages h
             where h.message_id = m.id and h.account_id = auth.uid()) then
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
    'author_alias', v_alias,
    'author_kind', m.author_kind
  );
end;
$function$;

grant execute on function public.get_message(uuid) to authenticated;

notify pgrst, 'reload schema';
