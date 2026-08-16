-- =============================================================================
-- ROLLBACK_76.sql — 撤销 76_conversation_view_state.sql
--
-- ⚠️ 破坏性：会 drop 掉 conversation_members 的三个视图状态列。
--    用户「清空过的记录」「删掉的会话」「静音设置」全部丢失 ——
--    效果是所有被隐藏的会话重新出现、所有清空过的记录重新可见。
--
--    **业务数据本身毫发无损** —— 这套机制从头到尾只做读取侧过滤，
--    从来没有删过任何一行 messages。
--
-- 保留列、只回退函数的话，把下面 alter table 那段注释掉即可。
-- =============================================================================

drop function if exists public.clear_conversation_history(uuid);
drop function if exists public.hide_conversation(uuid);
drop function if exists public.set_conversation_muted(uuid, boolean);

-- ── 恢复迁移 74 版本的 list_conversations（无视图状态过滤）───────────────────
drop function if exists public.list_conversations();
create function public.list_conversations()
returns table(conversation_id uuid, kind text, is_temporary boolean,
              expires_at timestamp with time zone, status text, my_identity text,
              peer_id uuid, display_name text, display_avatar text,
              display_breed text, display_stage text, members_count integer,
              last_message text, last_message_at timestamp with time zone)
language sql
security definer
set search_path to 'public'
as $function$
  with my_convs as (
    select cm.conversation_id, cm.member_identity as my_identity
    from public.conversation_members cm
    where cm.account_id = auth.uid()
  ),
  peer as (
    select cm.conversation_id, cm.account_id as peer_id, cm.member_identity as peer_identity
    from public.conversation_members cm
    join public.conversations c2 on c2.id = cm.conversation_id
    where cm.account_id <> auth.uid()
      and c2.kind in ('dm','petchat','driftbottle')
  ),
  last_msg as (
    select distinct on (m.conversation_id) m.conversation_id, m.content, m.created_at
    from public.messages m
    order by m.conversation_id, m.created_at desc
  )
  select
    c.id, c.kind, c.is_temporary, c.expires_at, c.status,
    mc.my_identity, pe.peer_id,
    case when c.kind='group' then c.name
         when c.kind='zzuper_talk' then me.pet_name
         when pe.peer_identity='pet' then pp.pet_name
         else pp.real_name end,
    case when c.kind='group' then c.avatar_url
         when c.kind='zzuper_talk' then me.pet_avatar_url
         when pe.peer_identity='pet' then pp.pet_avatar_url
         else pp.avatar_url end,
    case when c.kind='zzuper_talk' then me.pet_breed
         when pe.peer_identity='pet' then pp.pet_breed
         else null end,
    case when c.kind='zzuper_talk' then me.pet_stage
         when pe.peer_identity='pet' then pp.pet_stage
         else null end,
    c.members_count, lm.content, lm.created_at
  from my_convs mc
  join public.conversations c   on c.id = mc.conversation_id
  left join peer pe             on pe.conversation_id = c.id
  left join public.profiles pp  on pp.id = pe.peer_id
  left join public.profiles me  on me.id = auth.uid()
  left join last_msg lm         on lm.conversation_id = c.id
  where not (c.is_temporary and c.expires_at is not null and c.expires_at < now())
  order by coalesce(lm.created_at, c.created_at) desc;
$function$;

grant execute on function public.list_conversations() to authenticated;

-- ── 删列（想保留用户的视图状态就注释掉这段）─────────────────────────────────
alter table public.conversation_members
  drop column if exists cleared_before,
  drop column if exists hidden_at,
  drop column if exists muted_at;

notify pgrst, 'reload schema';
