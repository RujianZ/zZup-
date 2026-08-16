-- =============================================================================
-- ROLLBACK_91.sql — 撤销 91_stranger_optout_covers_pulse_and_roam.sql
--
-- 回滚后：陌生人开关退回到「只管私信」（= 迁移 90 的状态）。
-- Pulse 和 Roam 不再受它约束。
--
-- ⚠️ 回滚的话，ProfileScreen 里那两句文案要跟着改回去 ——
--    否则界面上写着「Pulse 和 Roam 都会停」，实际并不会停，
--    那就又变成一句不实陈述（这个功能本来就是因为官网吹了没做的东西才补的）。
--
-- 不动 profiles.allow_stranger_dm 列，也不动 create_dm —— 那些属于迁移 90。
-- 要连私信一起撤，再跑 ROLLBACK_90.sql。
-- =============================================================================

drop trigger if exists trg_stranger_optout_match_queue     on public.match_queue;
drop trigger if exists trg_stranger_optout_travel_posts    on public.travel_posts;
drop trigger if exists trg_stranger_optout_travel_comments on public.travel_comments;

drop function if exists public.enforce_stranger_optout();

-- reply_to_travel_comment 还原成线上原版（无陌生人判定）。
-- 注意两点，都是写迁移 91 时踩过的：
--   1. 参数名必须是 p_reply_content —— 客户端 travel.ts:290 就是这么传的
--   2. 原版**没有** set search_path。这里保留补上的那一行（纯加固，
--      函数体内对象本来就是 public. 全限定），不想要就删掉这行再跑。
create or replace function public.reply_to_travel_comment(
  p_comment_id     uuid,
  p_reply_content  text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_comment_author_id uuid;
  v_post_owner_id     uuid;
  v_travel_post_id    uuid;
  v_group_id          uuid;
begin
  select tc.author_id, tp.user_id, tc.travel_post_id
    into v_comment_author_id, v_post_owner_id, v_travel_post_id
  from public.travel_comments tc
  join public.travel_posts tp on tp.id = tc.travel_post_id
  where tc.id = p_comment_id;

  if v_comment_author_id is null or v_post_owner_id is null then
    raise exception 'Comment not found';
  end if;

  if auth.uid() != v_post_owner_id then
    raise exception 'Permission denied: Only the travel post owner can reply to this comment';
  end if;

  select cm1.conversation_id into v_group_id
  from public.conversation_members cm1
  join public.conversation_members cm2 on cm2.conversation_id = cm1.conversation_id
  join public.conversations c on c.id = cm1.conversation_id
  where c.kind = 'driftbottle'
    and cm1.account_id = v_post_owner_id
    and cm2.account_id = v_comment_author_id
  limit 1;

  if v_group_id is not null then
    update public.conversations
    set is_temporary = true,
        is_agent_chat = false,
        expires_at = timezone('utc'::text, now()) + interval '24 hours'
    where id = v_group_id;
  else
    insert into public.conversations (
      kind, description, created_by, members_count,
      is_temporary, is_agent_chat, expires_at
    )
    values (
      'driftbottle', '旅行留言回复', v_post_owner_id, 2,
      true, false, timezone('utc'::text, now()) + interval '24 hours'
    )
    returning id into v_group_id;

    insert into public.conversation_members (conversation_id, account_id, role)
    values (v_group_id, v_post_owner_id, 'member'),
           (v_group_id, v_comment_author_id, 'member');
  end if;

  insert into public.messages (conversation_id, sender_id, identity_mode, content)
  values (v_group_id, v_post_owner_id, 'real', p_reply_content);

  return v_group_id;
end;
$function$;

-- accepts_strangers 保留：create_dm（迁移 90）没用它，但留着无害，
-- 而且 ROLLBACK_90 里也不依赖它。要彻底清干净再执行下面这行。
-- drop function if exists public.accepts_strangers(uuid);

notify pgrst, 'reload schema';
