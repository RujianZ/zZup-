-- =============================================================================
-- 71_reports.sql
-- 举报系统
--
-- 设计要点（都是前面踩过的坑总结出来的）：
--
-- 1. **外键一律 ON DELETE SET NULL，并额外存 zzup_id 文本快照**
--    如果写成 CASCADE，被举报的人删号 → 举报记录跟着消失 → 等于给"发完违规内容
--    就跑"开了后门。这和 messages.sender_id 是同一类问题。
--    uuid 被置空后还得知道当初举报的是谁，所以另存文本快照。
--    这一条同时补上了删除账号设计里缺失的第三层「隔离保存」。
--
-- 2. **举报人不能读回自己的举报**
--    reports 里存着服务端解析出来的 reported_user_id。如果开放 SELECT，
--    举报一个宠物马甲之后读一下自己的记录，就知道马甲是谁了 —— 匿名当场破功。
--    所以这张表对客户端**只写不读**。将来要做「我的举报」列表，用一个
--    只返回安全字段（分类/状态/时间）的 RPC，不要直接开表。
--
-- 3. **客户端不传 user_id，只传 zzup_id 或会话 id，由服务端解析**
--    接口从第一天就不依赖"客户端知道对方是谁"，将来上不透明句柄时不用重做。
--
-- 4. **上下文由服务端快照，不依赖用户截图**
--    截图可以伪造，服务端直出的聊天记录不能。用户只需要选人 + 选分类，
--    截图降级成可选补充。
--
-- 回滚：db-backups/2026-08-15/ROLLBACK_71.sql
-- =============================================================================

-- ── 表 ───────────────────────────────────────────────────────────────────────
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),

  -- 举报人（uuid 会在删号后置空，zzup_id 快照永久保留）
  reporter_id        uuid references public.profiles(id) on delete set null,
  reporter_zzup_id   text,

  -- 被举报对象
  reported_user_id   uuid references public.profiles(id) on delete set null,
  reported_zzup_id   text,
  -- 举报的是这个人的真人身份还是宠物身份。宠物马甲骚扰本身就是一种规避行为，
  -- 丢掉这个信息就看不出来了。
  reported_identity  text check (reported_identity in ('real','pet')),

  category    text not null check (category in (
                'harassment',      -- 骚扰、辱骂、人身攻击
                'sexual_content',  -- 色情、性骚扰
                'violence',        -- 暴力、威胁、自残鼓动
                'spam',            -- 垃圾信息、广告、诈骗
                'impersonation',   -- 冒充他人
                'underage',        -- 涉及未成年人（走强制上报流程）
                'self_harm',       -- 担心对方有自伤风险（关怀介入，不是处罚）
                'other')),
  description text not null,
  attachments jsonb not null default '[]'::jsonb,   -- report-media 桶内路径
  -- 服务端快照的证据 + 环境信息：conversation_id / messages / platform / app_version
  context     jsonb not null default '{}'::jsonb,

  -- 处理
  status          text not null default 'open'
                    check (status in ('open','reviewing','actioned','dismissed')),
  handled_by      uuid references public.profiles(id) on delete set null,
  handled_at      timestamptz,
  resolution_note text,

  created_at timestamptz not null default now()
);

create index if not exists reports_status_created_idx
  on public.reports (status, created_at desc);
create index if not exists reports_reported_idx
  on public.reports (reported_user_id, created_at desc);
create index if not exists reports_reporter_idx
  on public.reports (reporter_id, created_at desc);

comment on table public.reports is
  '举报记录。对客户端只写不读 —— 表里有服务端解析出的被举报人身份，读回去会破坏宠物马甲的匿名。';

-- ── RLS：只写不读 ────────────────────────────────────────────────────────────
alter table public.reports enable row level security;

-- 故意不建 SELECT / UPDATE / DELETE 策略：
--   · 客户端读不到任何一行（含自己提交的）
--   · service_role 绕过 RLS，你们在 Dashboard 里照常处理
-- 插入也不走表策略，统一走下面的 SECURITY DEFINER RPC。
revoke all on public.reports from anon, authenticated;

-- ── 存储桶：举报截图 ─────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('report-media', 'report-media', false)
on conflict (id) do nothing;

-- 举报人只能往自己的目录里写
drop policy if exists "report media: owner can upload" on storage.objects;
create policy "report media: owner can upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'report-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 故意不给任何 SELECT 策略：
-- 举报截图里往往包含**第三方**的内容（对方发的违规消息），
-- 不能像聊天附件那样对"会话成员"开放。只有 service_role 能读。

-- ── 提交 RPC ─────────────────────────────────────────────────────────────────
create or replace function public.submit_report(
  p_category           text,
  p_description        text,
  p_reported_zzup_id   text default null,
  p_conversation_id    uuid default null,
  p_reported_identity  text default null,
  p_attachments        jsonb default '[]'::jsonb,
  p_client_info        jsonb default '{}'::jsonb
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
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  if p_description is null or length(trim(p_description)) < 5 then
    raise exception 'Please describe what happened (at least 5 characters)';
  end if;

  -- 限流：24 小时内最多 5 条，防止拿举报当骚扰工具
  select count(*) into v_recent_count
  from public.reports
  where reporter_id = v_uid and created_at > now() - interval '24 hours';

  if v_recent_count >= 5 then
    raise exception 'You have reached the daily report limit. Please contact support if this is urgent.';
  end if;

  select zzup_id into v_reporter_zzup from public.profiles where id = v_uid;

  -- 被举报人：客户端只给短号，服务端自己解析成 uuid
  if p_reported_zzup_id is not null then
    select id into v_reported_id
    from public.profiles
    where zzup_id = p_reported_zzup_id and deleted_at is null;
  end if;

  -- 上下文快照：只有举报人确实在这个会话里，才允许抓取
  if p_conversation_id is not null
     and exists (select 1 from public.conversation_members
                 where conversation_id = p_conversation_id and account_id = v_uid)
  then
    select coalesce(jsonb_agg(m order by m.created_at), '[]'::jsonb) into v_snapshot
    from (
      select jsonb_build_object(
               'message_id',    msg.id,
               'sender_zzup_id', p.zzup_id,
               'identity_mode', msg.identity_mode,
               'content',       msg.content,
               'attachments',   msg.attachments,
               'created_at',    msg.created_at
             ) as m,
             msg.created_at
      from public.messages msg
      left join public.profiles p on p.id = msg.sender_id
      where msg.conversation_id = p_conversation_id
      order by msg.created_at desc
      limit 50
    ) m;

    -- 没指定被举报人时，从会话里推断对方（仅两人会话）
    if v_reported_id is null then
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
    category, description, attachments, context
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
    )
  )
  returning id into v_report_id;

  return v_report_id;
end;
$function$;

grant execute on function public.submit_report(text, text, text, uuid, text, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
