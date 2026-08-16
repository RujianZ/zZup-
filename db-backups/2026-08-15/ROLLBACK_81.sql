-- =============================================================================
-- ROLLBACK_81.sql — 撤销 81_fix_profile_embeds_and_block_filter.sql
--
-- ⚠️ 除非同时回滚 79，否则**回滚这条会把拉黑列表和 Roam 留言重新打回空白**。
--
--    这两个 RPC 是为了替换 PostgREST 内嵌联查而建的：
--        blocked:profiles!blocked_users_blocked_id_fkey(...)
--        author:profiles!travel_comments_author_id_fkey(...)
--    79 撤销 profiles 读权限之后，内嵌联查会**静默返回空**（不报错），
--    表现就是「拉黑了但列表是空的」「Roam 留言没有作者」。
--
--    删掉 RPC 之后客户端只能退回内嵌联查，那条路在 79 之下是死的。
--    正确顺序是先 ROLLBACK_79 再 ROLLBACK_81。
--
--    客户端要一起改回去：
--      · lib/api/friends.ts  — getBlockedUsers
--      · lib/api/travel.ts   — getTravelComments
--
-- ⚠️ 同时丢失：消息读取里的拉黑过滤。回滚后**被拉黑的人说的话会重新出现在
--    聊天记录里** —— 拉黑退回到只影响 search_users 的状态，也就是几乎没用。
--
-- 前置：ROLLBACK_83 已执行（那边把这两个函数恢复成了本迁移的版本）。
-- =============================================================================

drop function if exists public.list_blocked_identities();
drop function if exists public.list_travel_comments(uuid);

-- ── 恢复迁移 77 的 list_messages / get_message（无拉黑过滤）─────────────────

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
