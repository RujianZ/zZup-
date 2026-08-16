-- =============================================================================
-- 80_anonymous_report_and_block.sql
-- 按「会话内代号」举报和拉黑匿名宠物
--
-- 问题：现有的 submit_report 收 p_reported_zzup_id、block_identity 收
-- p_blocked_id —— 都要求客户端手里有被举报人的身份标识。
--
-- 但匿名宠物**恰恰不该给客户端任何身份标识**（迁移 77/78：宠物消息的
-- sender_id 恒为 null，客户端只知道一个会话内的字母）。
-- 于是就出现了这个死结：**看得见的东西举报不了**。
--
-- 解法：新增按 (会话, 代号) 提交的变体，服务端自己把代号解析成账号。
-- 客户端从头到尾不需要、也拿不到被举报人是谁 —— 这正是重点。
--
-- 两个函数都复用已有实现，只是把「代号 → 账号」这一步放在服务端：
--   submit_report_by_alias  → 解析后走 submit_report 同一套逻辑
--   block_pet_by_alias      → 解析后走 block_identity
--
-- 回滚：db-backups/2026-08-15/ROLLBACK_80.sql
-- =============================================================================

-- ── 举报匿名宠物 ─────────────────────────────────────────────────────────────
create or replace function public.submit_report_by_alias(
  p_conversation uuid,
  p_alias        text,
  p_category     text,
  p_description  text,
  p_attachments  jsonb default '[]'::jsonb,
  p_client_info  jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_account uuid;
  v_zzup    text;
  v_report  uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- 举报人必须真的在这个会话里，否则任何人都能拿 (会话, 代号) 组合乱报
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

  select zzup_id into v_zzup from public.profiles where id = v_account;

  -- 复用 submit_report：限流、会话快照、通知触发器全都在那边，不重复实现
  v_report := public.submit_report(
    p_category          => p_category,
    p_description       => p_description,
    p_reported_zzup_id  => v_zzup,
    p_conversation_id   => p_conversation,
    p_reported_identity => 'pet',
    p_attachments       => p_attachments,
    p_client_info       => p_client_info
  );

  -- 代号提到 context 顶层。运营处理举报时第一眼要看的就是「举的是哪只」——
  -- submit_report 会把 p_client_info 埋到 context.client 下面，太深了。
  update public.reports
     set context = context || jsonb_build_object('reported_alias', p_alias)
   where id = v_report;

  return v_report;
end;
$function$;

grant execute on function public.submit_report_by_alias(uuid, text, text, text, jsonb, jsonb)
  to authenticated;

-- ── 拉黑匿名宠物 ─────────────────────────────────────────────────────────────
-- 拉黑的是**宠物身份**，不是这个人。对方用真人身份仍能联系你 ——
-- 这是有意的：拉黑效果如果跨身份可观测，本身就泄露了「这两个身份是同一个人」。
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
end;
$function$;

grant execute on function public.block_pet_by_alias(uuid, text) to authenticated;

notify pgrst, 'reload schema';
