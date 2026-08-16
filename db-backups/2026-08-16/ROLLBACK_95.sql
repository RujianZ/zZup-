-- =============================================================================
-- ROLLBACK_95.sql — 撤销 95_report_a_specific_message.sql
--
-- 跑这个之前先回退 App（ReportScreen 会传 p_reported_message_id，
-- 旧签名收不下这个参数 → 举报直接失败）。
-- 顺序：先 App，再 ROLLBACK_95，最后（如果还要）ROLLBACK_94。
--
-- ⚠️ 回滚后 Google Play 的 AI 内容举报要求重新变成未满足
--    （AI-Generated Content policy 要求应用内可举报 AI 生成的冒犯内容）。
--
-- ⚠️ 已存在的 ai_output 类举报会**违反还原后的 CHECK 约束**。
--    所以下面先把它们改成 'other' 再收紧约束 —— 直接加约束会失败。
--    这一步是有损的：改完就分不出哪些原本是 AI 举报了，
--    subject 列保留正是为了留一条线索。
--
-- members_count 的数据修复**不回滚** —— 那是修正错误数据，没有理由退回去。
-- =============================================================================

-- 客户端先回退，这里不再接受 message id 版本的签名
drop function if exists public.submit_report(text, text, text, uuid, text, jsonb, jsonb, uuid);

-- 还原迁移 71 的七参数版本（不含 message id / subject / author_kind 快照）
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

  select count(*) into v_recent_count
  from public.reports
  where reporter_id = v_uid and created_at > now() - interval '24 hours';

  if v_recent_count >= 5 then
    raise exception 'You have reached the daily report limit. Please contact support if this is urgent.';
  end if;

  select zzup_id into v_reporter_zzup from public.profiles where id = v_uid;

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

-- 先降级历史数据，否则收紧 CHECK 会直接失败
update public.reports set category = 'other' where category = 'ai_output';

alter table public.reports drop constraint if exists reports_category_check;
alter table public.reports add constraint reports_category_check
  check (category in (
    'harassment','sexual_content','violence','spam',
    'impersonation','underage','self_harm','other'));

-- 两列保留：reported_message_id 和 subject 是**已经收上来的证据**，
-- 删了就没了。纯附加列，留着不影响还原后的函数。
-- 确实要清干净再执行：
-- alter table public.reports drop constraint if exists reports_subject_check;
-- alter table public.reports drop column if exists subject;
-- alter table public.reports drop column if exists reported_message_id;

notify pgrst, 'reload schema';
