-- =============================================================================
-- 81_fix_profile_embeds_and_block_filter.sql
--
-- 两件事，都是实测发现的：
--
-- ── 1. 补上迁移 79 漏掉的两处 profiles 内嵌联查（我的回归）──────────────────
--
-- 迁移 79 撤销了 authenticated 对 profiles 的列级 SELECT。当时扫的是
-- `from('profiles')`，**漏了 PostgREST 的内嵌写法**：
--
--     .select('..., blocked:profiles!blocked_users_blocked_id_fkey ( ... )')
--     .select('..., profiles!travel_comments_author_id_fkey ( ... )')
--
-- 内嵌联查同样依赖列级授权，于是拉黑列表和 Roam 留言作者双双读不出来 ——
-- 表现是「拉黑成功了但 block list 是空的」。
--
-- ── 2. 拉黑对消息**从来没有生效过**（既有缺陷，不是回归）────────────────────
--
-- blocked_users 只在 search_users 里被用到。消息读取路径（原来的直查、
-- 现在的 list_messages）从头到尾没有过滤过被拉黑的人。
-- 所以「拉黑了还能看到他的消息」是一直如此，不是这次改坏的。
--
-- 过滤放在**读取侧**（只影响我这边看到什么），不动 messages 表：
--   · 对方察觉不到自己被拉黑 —— 拉黑效果必须不可观测，
--     否则「我用真人身份能发出去、用宠物身份发不出去」本身就泄露了
--     「这两个身份是同一个人」
--   · 举报快照仍然完整
--
-- 身份级拉黑：拉黑 'pet' 只挡宠物身份的消息，那个人以真人身份说话仍然看得见。
--
-- 回滚：db-backups/2026-08-15/ROLLBACK_81.sql
-- =============================================================================

-- ── 我的拉黑列表 ─────────────────────────────────────────────────────────────
create or replace function public.list_blocked_identities()
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

-- ── Roam 留言（作者信息）────────────────────────────────────────────────────
-- Roam 是真人发帖（宠物只是跑腿的趣味角色），所以留言作者显示真名。
create or replace function public.list_travel_comments(p_post uuid)
returns table(id uuid, travel_post_id uuid, author_id uuid, content text,
              created_at timestamptz, author_name text, author_avatar_url text)
language sql
security definer
set search_path to 'public'
as $function$
  select c.id, c.travel_post_id, c.author_id, c.content, c.created_at,
         p.real_name, p.avatar_url
  from public.travel_comments c
  left join public.profiles p on p.id = c.author_id
  where c.travel_post_id = p_post
    and (p.deleted_at is null or p.id is null)
  order by c.created_at asc;
$function$;

grant execute on function public.list_travel_comments(uuid) to authenticated;

-- ── 消息读取加入拉黑过滤 ────────────────────────────────────────────────────
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
    -- 被我拉黑的身份，消息不再出现在我这边。
    -- 按 (账号, 身份) 匹配：拉黑 'pet' 不影响他以真人身份说的话。
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

-- ── 单条消息（Realtime 补查）同样过滤 ───────────────────────────────────────
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

  -- 被拉黑身份发来的实时消息直接丢弃
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

notify pgrst, 'reload schema';
