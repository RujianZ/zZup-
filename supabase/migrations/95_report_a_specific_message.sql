-- =============================================================================
-- 95_report_a_specific_message.sql
-- 举报可以指到**具体某一条消息**，并区分「举报人」和「举报 AI」
--
-- 配合迁移 94 的长按菜单（Copy / Remove for me / Report）。
--
-- ── 一、Google Play 的要求 ───────────────────────────────────────────────────
-- AI-Generated Content policy 覆盖 "Text-to-text AI chatbot apps"，要求：
--   1. 应用内可举报 AI 生成的冒犯内容，用户不用离开 App
--   2. 必须**用这些举报改进过滤和审核**（是闭环要求，不是收着就行）
-- 现在八个分类全是人的行为，没有一个能表达「我的宠物刚说了很糟糕的话」。
--
-- ── 二、为什么要 subject 而不是靠 reported_user_id 是否为 null 去猜 ──────────
-- 举报 AI 时没有人可以封 —— 处置是改 prompt，是另一条路。运营需要一眼分开
-- 两个队列。而 reported_user_id 为 null 还有别的原因（被举报人删号后置空、
-- 通用举报没指定对象），拿它当判据会把三件事混在一起。
--
-- subject 由**服务端**按被举报消息的 author_kind 推导，不收客户端的值 ——
-- 客户端说了不算，避免有人把真人骚扰标成「AI 说的」来给对方脱罪。
--
-- ── 三、reported_message_id 用 SET NULL，不用 CASCADE ────────────────────────
-- 和迁移 71 定的原则一致：CASCADE 等于「删掉证据就能让举报消失」。
-- 消息本来就永不删除，但外键策略要按最坏情况写。
--
-- ── 四、顺手修一个潜伏缺陷：members_count 有 9 条是错的 ──────────────────────
-- conversations.members_count 这个冗余列在 9 条会话上记录成 4，实际是 2
-- （dm 4 条 / driftbottle 2 条 / petchat 3 条）。
-- 而 submit_report 推断被举报人的分支正好卡着 `and c.members_count = 2`。
--
-- 今天这是**潜伏**的：ReportScreen 的三个入口，宠物举报走 by_alias（显式传代号）、
-- 真人举报显式传 zzup_id、通用举报不带会话，**没有任何入口会走到那条推断**。
-- 但这次要加的正是「在会话里举报」入口 —— 一加上它立刻变成活的，
-- 而且是**静默失败**（举报提交成功，记录里却没有被举报人）。所以必须一起修。
--
-- 只修数据、不加维护触发器：members_count 的写入散在几个 RPC 里，
-- 那是另一件事，这里不顺手扩大范围。
--
-- 回滚：db-backups/2026-08-16/ROLLBACK_95.sql
-- =============================================================================

-- ── 数据修复 ─────────────────────────────────────────────────────────────────
update public.conversations c
set members_count = sub.n
from (select conversation_id, count(*)::int as n
      from public.conversation_members group by conversation_id) sub
where sub.conversation_id = c.id and c.members_count is distinct from sub.n;

-- ── 新列 ─────────────────────────────────────────────────────────────────────
alter table public.reports
  add column if not exists reported_message_id uuid
    references public.messages(id) on delete set null;

alter table public.reports
  add column if not exists subject text not null default 'user';

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid='public.reports'::regclass and conname='reports_subject_check') then
    alter table public.reports
      add constraint reports_subject_check check (subject in ('user','ai'));
  end if;
end $$;

comment on column public.reports.reported_message_id is
  '举报指向的具体那条消息（长按气泡 → Report）。SET NULL 不用 CASCADE：'
  '删掉证据就能让举报消失是不行的，和迁移 71 同一原则。';
comment on column public.reports.subject is
  'user=举报某个人 / ai=举报 AI 的输出。由服务端按 messages.author_kind 推导，'
  '不收客户端的值 —— 否则可以把真人骚扰标成 AI 说的来脱罪。';

create index if not exists reports_subject_status_idx
  on public.reports (subject, status, created_at desc);

-- ── 分类增加 ai_output ───────────────────────────────────────────────────────
alter table public.reports drop constraint if exists reports_category_check;
alter table public.reports add constraint reports_category_check
  check (category in (
    'harassment','sexual_content','violence','spam',
    'impersonation','underage','self_harm',
    'ai_output',   -- ← 迁移 95：AI 说了不该说的话
    'other'));

-- ── submit_report：加 p_reported_message_id ──────────────────────────────────
-- 参数个数变了，create or replace 会**新建一个重载**而不是替换（PostgREST 会
-- 因此产生歧义），所以必须先 DROP 旧签名。
-- submit_report_by_alias 用具名参数调用它，多一个带默认值的参数不影响解析。
drop function if exists public.submit_report(text, text, text, uuid, text, jsonb, jsonb);

create or replace function public.submit_report(
  p_category           text,
  p_description        text,
  p_reported_zzup_id   text default null,
  p_conversation_id    uuid default null,
  p_reported_identity  text default null,
  p_attachments        jsonb default '[]'::jsonb,
  p_client_info        jsonb default '{}'::jsonb,
  p_reported_message_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid            uuid := auth.uid();
  v_reporter_zzup  text;
  v_reported_id    uuid;
  v_recent_count   int;
  v_snapshot       jsonb := '[]'::jsonb;
  v_report_id      uuid;
  v_msg            public.messages;
  v_subject        text := 'user';
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  if p_description is null or length(trim(p_description)) < 5 then
    raise exception 'Please describe what happened (at least 5 characters)';
  end if;

  select count(*) into v_recent_count
  from public.reports
  where reporter_id = v_uid and created_at > now() - interval '24 hours';

  if v_recent_count >= 5 then
    raise exception 'You have reached the daily report limit. Please contact support if this is urgent.';
  end if;

  select zzup_id into v_reporter_zzup from public.profiles where id = v_uid;

  -- ── 迁移 95：举报指向了具体一条消息 ───────────────────────────────────────
  if p_reported_message_id is not null then
    select * into v_msg from public.messages where id = p_reported_message_id;

    -- 举报人必须在这条消息所在的会话里，否则任何人拿一个 message_id 就能
    -- 举报到看不见的内容，同时也是一条「这个 id 存不存在」的探测信道。
    if v_msg.id is null or not exists (
      select 1 from public.conversation_members
      where conversation_id = v_msg.conversation_id and account_id = v_uid
    ) then
      raise exception 'Message not found' using errcode = '42501';
    end if;

    -- 会话从消息上取，客户端不用再传一遍
    p_conversation_id := coalesce(p_conversation_id, v_msg.conversation_id);

    -- subject 由服务端定：AI 说的话没有人可以封，要走另一条处理路径
    if v_msg.author_kind in ('ai_pet','ai_proxy') then
      v_subject := 'ai';
    else
      v_subject := 'user';
      -- 人说的话：被举报人就是这条消息的作者。这一步让「在会话里举报」
      -- 不再依赖下面那段 members_count 推断（那个冗余列曾经是错的）。
      v_reported_id := coalesce(v_reported_id, v_msg.sender_id);
    end if;
  end if;

  if p_reported_zzup_id is not null then
    select id into v_reported_id
    from public.profiles
    where zzup_id = p_reported_zzup_id and deleted_at is null;
  end if;

  if p_conversation_id is not null
     and exists (select 1 from public.conversation_members
                 where conversation_id = p_conversation_id and account_id = v_uid)
  then
    select coalesce(jsonb_agg(m order by m.created_at), '[]'::jsonb) into v_snapshot
    from (
      select jsonb_build_object(
               'message_id',     msg.id,
               'sender_zzup_id', p.zzup_id,
               'identity_mode',  msg.identity_mode,
               'author_kind',    msg.author_kind,      -- 迁移 95：谁说的
               'content',        msg.content,
               'attachments',    msg.attachments,
               'created_at',     msg.created_at
             ) as m,
             msg.created_at
      from public.messages msg
      left join public.profiles p on p.id = msg.sender_id
      where msg.conversation_id = p_conversation_id
      order by msg.created_at desc
      limit 50
    ) m;

    -- 没指定被举报人时，从会话里推断对方（仅两人会话）
    if v_reported_id is null and v_subject = 'user' then
      select cm.account_id into v_reported_id
      from public.conversation_members cm
      join public.conversations c on c.id = cm.conversation_id
      where cm.conversation_id = p_conversation_id
        and cm.account_id <> v_uid
        and c.members_count = 2
      limit 1;
    end if;
  end if;

  insert into public.reports (
    reporter_id, reporter_zzup_id,
    reported_user_id, reported_zzup_id, reported_identity,
    category, description, attachments, context,
    reported_message_id, subject
  ) values (
    v_uid, v_reporter_zzup,
    v_reported_id,
    coalesce(p_reported_zzup_id, (select zzup_id from public.profiles where id = v_reported_id)),
    p_reported_identity,
    p_category, trim(p_description), coalesce(p_attachments, '[]'::jsonb),
    jsonb_build_object(
      'conversation_id', p_conversation_id,
      'messages',        v_snapshot,
      'client',          coalesce(p_client_info, '{}'::jsonb)
    ),
    p_reported_message_id, v_subject
  )
  returning id into v_report_id;

  return v_report_id;
end;
$function$;

grant execute on function public.submit_report(text, text, text, uuid, text, jsonb, jsonb, uuid)
  to authenticated;

notify pgrst, 'reload schema';
