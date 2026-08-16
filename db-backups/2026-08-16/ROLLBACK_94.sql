-- =============================================================================
-- ROLLBACK_94.sql — 撤销 94_message_author_kind_and_hide.sql
--
-- ⚠️ 客户端必须一起回退，否则：
--    · ChatScreen 长按菜单调 hide_message_for_me → RPC 不存在 → 报错
--    · Message.author_kind 全变 undefined → isAiMessage() 恒为 false
--      → 举报 AI 的消息会被当成「举报一个人」，**静默走错分支**
--    先回退 App，再跑这个。
--
-- ⚠️ 先跑 ROLLBACK_95：submit_report 会读 messages.author_kind，
--    这里把列删了它就报错。顺序是 95 → 94。
--
-- hidden_messages 里的数据会一起消失 —— 用户「Remove for me」隐藏过的消息
-- 会**重新出现**在他们的聊天里。这个后果对用户可见，回滚前想清楚。
-- =============================================================================

drop function if exists public.hide_message_for_me(uuid);
drop function if exists public.unhide_message_for_me(uuid);
drop table if exists public.hidden_messages;

drop trigger if exists on_message_set_author_kind on public.messages;
drop function if exists public.set_message_author_kind();

-- list_messages / get_message 还原成迁移 82/64 时期的形态（无 author_kind、
-- 无 hidden_messages 过滤）。函数体取自 pg_get_functiondef 的迁移 94 之前版本。
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
  author_pet_stage text, author_alias text
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

grant execute on function public.list_messages(uuid, integer, timestamptz) to authenticated;

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

-- 列保留，不删。删了就丢掉每条消息「是谁说的」这个信息，重新回填只能靠推断，
-- 而推断对 Pulse 是不准的（接管后真人也能用宠物身份发言）。
-- 确实要清干净再执行：
-- alter table public.messages drop column if exists author_kind;

notify pgrst, 'reload schema';
