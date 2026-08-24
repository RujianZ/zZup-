-- =============================================================================
-- 103_fix_agent_chat_webhook_url.sql
-- 修复 Pulse 双 AI 对话只说一句就沉默的 Bug：
-- 将本地测试的 kong:8000 替换为云端正式的 agent-chat Edge Function 生产地址与鉴权头
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_supabase_internal_url()
RETURNS text
LANGUAGE plpgsql
as $$
begin
  -- 生产环境 Supabase Cloud Edge Function 地址
  return 'https://ulrzilxhuuxxezhgrptg.supabase.co/functions/v1/agent-chat';
end;
$$;

CREATE OR REPLACE FUNCTION public.trigger_agent_chat_reply()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
as $$
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
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscnppbHhodXV4eGV6aGdycHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMjE2MzMsImV4cCI6MjA4OTc5NzYzM30.iZAWeaQkf4PqgFd-yC8hvVERF8PhETKfBbb_DEuC19E';
begin
  -- 1. 检查是否为活跃的 AI 代理对话群组
  select is_agent_chat into v_is_agent_chat
  from public.conversations
  where id = new.conversation_id;

  if v_is_agent_chat is not true then
    return new;
  end if;

  -- 2. 找到对话中的两位用户（User A 与 User B）
  select created_by into v_user_a_id
  from public.conversations
  where id = new.conversation_id;

  select account_id into v_user_b_id
  from public.conversation_members
  where conversation_id = new.conversation_id and account_id != v_user_a_id
  limit 1;

  if v_user_b_id is null then
    return new;
  end if;

  -- 3. 确定当前发信方与下一轮应当发言的 AI
  v_prev_sender_id := new.sender_id;
  if new.sender_id = v_user_a_id then
    v_next_sender_id := v_user_b_id;
  else
    v_next_sender_id := v_user_a_id;
  end if;

  -- 4. 检查真人接管规则（Scheme C Rule）
  select exists(
    select 1 from public.messages
    where conversation_id = new.conversation_id and sender_id = v_next_sender_id and identity_mode = 'real'
  ) into v_next_sender_taken_over;

  -- 如果下一位发送者已经亲自真人发言接管，AI 停止生成
  if v_next_sender_taken_over is true then
    return new;
  end if;

  select exists(
    select 1 from public.messages
    where conversation_id = new.conversation_id and sender_id = v_prev_sender_id and identity_mode = 'real'
  ) into v_prev_sender_taken_over;

  -- 如果上一位发送者刚真人介入，允许下一位的 AI 发送且仅发送 1 条缓冲应答
  if v_prev_sender_taken_over is true then
    select count(*) into v_buffer_sent_count
    from public.messages
    where conversation_id = new.conversation_id 
      and sender_id = v_next_sender_id 
      and identity_mode = 'pet'
      and created_at > (
        select max(created_at) from public.messages 
        where conversation_id = new.conversation_id and sender_id = v_prev_sender_id and identity_mode = 'real'
      );

    if v_buffer_sent_count >= 1 then
      return new;
    end if;
  end if;

  -- 5. 检查每个宠物的最大发言轮次限制（最多 15 句）
  select count(*) into v_ai_count
  from public.messages
  where conversation_id = new.conversation_id and sender_id = v_next_sender_id and identity_mode = 'pet';

  if v_ai_count >= 15 then
    return new;
  end if;

  -- 6. 通过 pg_net 异步 HTTP POST 触发 agent-chat 云函数生成下一条 AI 回复
  v_internal_url := public.get_supabase_internal_url();
  perform net.http_post(
    url := v_internal_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key,
      'apikey', v_anon_key
    ),
    body := jsonb_build_object(
      'action', 'generate_reply',
      'group_id', new.conversation_id,
      'next_sender_id', v_next_sender_id,
      'is_buffer_turn', v_prev_sender_taken_over
    )
  );

  return new;
exception when others then
  raise warning 'trigger_agent_chat_reply failed: %', sqlerrm;
  return new;
end;
$$;
