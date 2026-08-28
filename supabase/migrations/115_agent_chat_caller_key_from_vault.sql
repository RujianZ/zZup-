-- =============================================================================
-- 115_agent_chat_caller_key_from_vault.sql
--
-- 接着 Ethan 的 103 往下修。103 把两件事做对了（地址换成公网、补上 Authorization
-- 头），但**那把硬编码的 key 是旧格式 JWT，已经失效**，所以触发器打过去吃 401 ——
-- 从「连不上」变成了「连上了但被拒」，Pulse 依然不转。
--
-- 2026-08-27 实测（同一个端点，只换 key）：
--     旧 JWT key      → POST /functions/v1/agent-chat  →  401   ← 网关拒绝
--     现行 publishable → POST /functions/v1/agent-chat  →  400   ← 过了鉴权，
--                                                              只是嫌 body 空
-- 401 vs 400 的差别就卡在鉴权那一关，这是判据。
--
-- 本迁移做两件事：
--   1. key 不再写死在函数体里，改成从 Vault 按名字读（跟 notify_ops 一个模式）
--   2. 失败时除了 raise warning，再走一趟 notify_ops → Discord，
--      免得下次又坏在没人看的地方
--
-- ⚠️ 前置：Vault 里要有名为 'agent_chat_caller_key' 的密钥（已于 2026-08-28 建好）。
--    本文件**不含密钥值** —— 那把 key 是 publishable 的（客户端里就有），
--    存 Vault 不是为了保密，是为了**轮换时只改一个地方**。
--
-- ⚠️ 编号说明：本文件本来编 104，但 103 和 104 都已经被占了
--    （103_deleted_accounts_cannot_sign_in / 104_ban_timestamp_must_be_finite）。
--    Ethan 的 103_fix_agent_chat_webhook_url 也撞了同一个号。
--    真实可用的下一个是 115。**加迁移之前先 ls 一遍。**
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trigger_agent_chat_reply()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_is_agent_chat boolean;
  v_user_a_id uuid;
  v_user_b_id uuid;
  v_next_sender_id uuid;
  v_prev_sender_id uuid;
  v_next_sender_taken_over boolean;
  v_prev_sender_taken_over boolean;
  v_buffer_sent_count integer;
  v_ai_count integer;
  v_internal_url text;
  v_key text;
begin
  -- 1. 是不是活跃的 AI 代理对话
  select is_agent_chat into v_is_agent_chat
  from public.conversations where id = new.conversation_id;

  if v_is_agent_chat is not true then
    return new;
  end if;

  -- 2. 找到对话里的两位用户
  select created_by into v_user_a_id
  from public.conversations where id = new.conversation_id;

  select account_id into v_user_b_id
  from public.conversation_members
  where conversation_id = new.conversation_id and account_id != v_user_a_id
  limit 1;

  if v_user_b_id is null then
    return new;
  end if;

  -- 3. 谁刚发言、下一轮轮到谁
  v_prev_sender_id := new.sender_id;
  if new.sender_id = v_user_a_id then
    v_next_sender_id := v_user_b_id;
  else
    v_next_sender_id := v_user_a_id;
  end if;

  -- 4. 真人接管规则（Scheme C）
  select exists(
    select 1 from public.messages
    where conversation_id = new.conversation_id
      and sender_id = v_next_sender_id and identity_mode = 'real'
  ) into v_next_sender_taken_over;

  if v_next_sender_taken_over is true then
    return new;
  end if;

  select exists(
    select 1 from public.messages
    where conversation_id = new.conversation_id
      and sender_id = v_prev_sender_id and identity_mode = 'real'
  ) into v_prev_sender_taken_over;

  -- 对方刚真人介入 → 只允许再发一条缓冲应答
  if v_prev_sender_taken_over is true then
    select count(*) into v_buffer_sent_count
    from public.messages
    where conversation_id = new.conversation_id
      and sender_id = v_next_sender_id
      and identity_mode = 'pet'
      and created_at > (
        select max(created_at) from public.messages
        where conversation_id = new.conversation_id
          and sender_id = v_prev_sender_id and identity_mode = 'real'
      );

    if v_buffer_sent_count >= 1 then
      return new;
    end if;
  end if;

  -- 5. 每只宠物最多 15 句
  select count(*) into v_ai_count
  from public.messages
  where conversation_id = new.conversation_id
    and sender_id = v_next_sender_id and identity_mode = 'pet';

  if v_ai_count >= 15 then
    return new;
  end if;

  -- 6. 异步触发 agent-chat
  --
  -- key 从 Vault 读，**不要写死在这里**。写死的下场见 103：
  -- 密钥格式一换，这条链就断，而且断得没有声音。
  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'agent_chat_caller_key';

  if v_key is null then
    raise warning 'trigger_agent_chat_reply: vault has no agent_chat_caller_key, Pulse rotation stopped';
    perform public.notify_ops('pulse_broken',
      jsonb_build_object('reason', 'missing agent_chat_caller_key in vault'));
    return new;
  end if;

  v_internal_url := public.get_supabase_internal_url();

  perform net.http_post(
    url := v_internal_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key,
      'apikey',        v_key
    ),
    body := jsonb_build_object(
      'action',         'generate_reply',
      'group_id',       new.conversation_id,
      'next_sender_id', v_next_sender_id,
      'is_buffer_turn', v_prev_sender_taken_over
    )
  );

  return new;

exception when others then
  -- 吞掉异常是对的（不能让 webhook 失败把用户发消息的事务一起回滚），
  -- 但**必须留声音**。103 已经加了 raise warning，这里再往 Discord 报一次 ——
  -- Postgres 日志没人盯着，这条链坏了三次都是事后才发现的。
  raise warning 'trigger_agent_chat_reply failed: %', sqlerrm;
  begin
    perform public.notify_ops('pulse_broken',
      jsonb_build_object('reason', sqlerrm, 'conversation_id', new.conversation_id));
  exception when others then
    null;  -- 连报警都失败了就算了，不能因此把用户的消息弄丢
  end;
  return new;
end;
$$;
