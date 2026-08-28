-- =============================================================================
-- 118_agent_chat_emergency_flag.sql
--
-- 补上 is_emergency 的**生产方**。
--
-- ── 背景 ─────────────────────────────────────────────────────────────
-- Ethan 在 agent-chat/index.ts 里写了一整套危机分支，读的是 body 里的
-- is_emergency：
--     line 287  if (!is_emergency)   → 跳过 15 条硬上限
--     line 357  if (is_emergency)    → 切到危机 prompt
--     line 427  if (!is_emergency)   → 跳过 5 秒拟人延迟
--
-- 2026-08-28 全库 + 全仓库排查：**这个标志没有任何人设置过。**
--   · 所有 schema 的 plpgsql/sql 函数里，含 emergency/suicide/crisis 的：0 个
--   · public 之外没有业务 schema，没有相关新表
--   · 全仓库 grep is_emergency：只有 agent-chat/index.ts 那 4 处，全是消费方
--   · supabase_migrations 里没有对应记录（那套 SQL 从没走过 migration）
-- 也就是说这三个分支一直是死代码，真人说「i wanna kill myself」时走的是
-- buffer 分支 —— 那里原本没有危机协议，只会回一句「主人马上就来」。
--
-- 这条迁移把生产方补上，让他那三个分支真正生效。
--
-- ── 三处必须豁免，少一处就白做 ───────────────────────────────────────
--   1) v_buffer_sent_count >= 1   缓冲语已发过 → 危机消息会被直接丢掉
--   2) v_ai_count >= 15           满 15 条 → 危机消息会被直接丢掉
--   3) body 里带上 is_emergency   否则函数侧永远是 undefined
--
-- ── 关键词检测只是第一道 ─────────────────────────────────────────────
-- 这里用关键词是因为它零延迟、零成本、不依赖外部服务，而且触发器本来就
-- 拿得到原文。它会漏（拼写变体、隐晦表达）。真正的检测应该是 OpenAI
-- moderation 的 self-harm 系列（self-harm / self-harm_intent /
-- self-harm_instructions）—— 那件事在 docs/给Ethan_内容审核.md 里，是他的活。
-- 补上之后，这里保留作为兜底，两道并存。
--
-- ── 误报的代价是可接受的 ─────────────────────────────────────────────
-- 误报 = 宠物多发一次求助资源。漏报 = 一个人在危机里没拿到 988。
-- 所以宁可宽。唯一刻意排除的是 "killing me"/"kills me" 这类口语
--（"this homework is killing me"），那个太常见，且语义完全无关。
--
-- ── 没有覆盖的一种情况（留给 Joe 决定）─────────────────────────────────
-- 如果**对面真人也已经接管**（v_next_sender_taken_over = true），触发器
-- 在最开头就 return 了，宠物完全不参与。此时两个真人在直接对话，危机消息
-- 不会有任何自动干预。没在这里改，因为往两个活人的对话里插一个 bot 是
-- 产品决策，不是 bug 修复。
-- =============================================================================

create or replace function public.trigger_agent_chat_reply()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_is_agent_chat boolean;
  v_user_a_id uuid; v_user_b_id uuid;
  v_next_sender_id uuid; v_prev_sender_id uuid;
  v_next_sender_taken_over boolean; v_prev_sender_taken_over boolean;
  v_buffer_sent_count integer; v_ai_count integer;
  v_internal_url text; v_key text;
  v_is_emergency boolean;
begin
  select is_agent_chat into v_is_agent_chat
  from public.conversations where id = new.conversation_id;
  if v_is_agent_chat is not true then return new; end if;

  select created_by into v_user_a_id
  from public.conversations where id = new.conversation_id;
  select account_id into v_user_b_id
  from public.conversation_members
  where conversation_id = new.conversation_id and account_id != v_user_a_id limit 1;
  if v_user_b_id is null then return new; end if;

  v_prev_sender_id := new.sender_id;
  if new.sender_id = v_user_a_id then v_next_sender_id := v_user_b_id;
  else v_next_sender_id := v_user_a_id; end if;

  -- ── 危机检测 ──────────────────────────────────────────────────────
  -- 只看真人发的话。宠物自己说的不算（否则危机回复会自我触发）。
  v_is_emergency := new.identity_mode = 'real'
    and new.content is not null
    and lower(new.content) ~ (
         'kill(ing)? myself'
      || '|killed myself'
      || '|end(ing)? my life'
      || '|take (my|his|her|their) own life'
      || '|end it all'
      || '|suicid'                        -- suicide / suicidal
      || '|wanna die|want to die|wish i (was|were) dead|better off dead'
      || '|don''?t want to (live|be here|exist)'
      || '|no reason to live|nothing to live for'
      || '|self[ -]?harm|hurt myself|harm myself|cut myself|cutting myself'
      || '|overdose|od on pills'
    );

  select exists(select 1 from public.messages
    where conversation_id = new.conversation_id
      and sender_id = v_next_sender_id and identity_mode = 'real')
  into v_next_sender_taken_over;
  if v_next_sender_taken_over is true then return new; end if;

  select exists(select 1 from public.messages
    where conversation_id = new.conversation_id
      and sender_id = v_prev_sender_id and identity_mode = 'real')
  into v_prev_sender_taken_over;

  -- 豁免 1/3：缓冲语已发过。危机时必须放行。
  if v_prev_sender_taken_over is true and v_is_emergency is not true then
    select count(*) into v_buffer_sent_count
    from public.messages
    where conversation_id = new.conversation_id
      and sender_id = v_next_sender_id and identity_mode = 'pet'
      and created_at > (select max(created_at) from public.messages
                        where conversation_id = new.conversation_id
                          and sender_id = v_prev_sender_id and identity_mode = 'real');
    if v_buffer_sent_count >= 1 then return new; end if;
  end if;

  -- 豁免 2/3：15 条硬上限。危机时必须放行 —— 这是 Ethan 那版的设计，保留。
  if v_is_emergency is not true then
    select count(*) into v_ai_count
    from public.messages
    where conversation_id = new.conversation_id
      and sender_id = v_next_sender_id and identity_mode = 'pet';
    if v_ai_count >= 15 then return new; end if;
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'agent_chat_caller_key';

  if v_key is null then
    raise warning 'trigger_agent_chat_reply: vault has no agent_chat_caller_key, Pulse rotation stopped';
    perform public.notify_ops('pulse_broken',
      jsonb_build_object('reason','missing agent_chat_caller_key in vault'));
    return new;
  end if;

  v_internal_url := public.get_supabase_internal_url();

  -- ⚠️ agent-chat 是 verify_jwt = true：网关在请求进函数**之前**就要 Authorization。
  --    x-ops-key 那套只对 verify_jwt=false 的函数（ops-notify / purge-media）成立。
  --    两个头都带：Authorization 让网关放行，x-ops-key 留着以便将来函数自校验。
  perform net.http_post(
    url := v_internal_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key,
      'apikey',        v_key,
      'x-ops-key',     v_key
    ),
    -- 豁免 3/3：把标志传给函数侧。
    body := jsonb_build_object(
      'action','generate_reply',
      'group_id', new.conversation_id,
      'next_sender_id', v_next_sender_id,
      'is_buffer_turn', v_prev_sender_taken_over,
      'is_emergency', coalesce(v_is_emergency, false))
  );

  return new;
exception when others then
  raise warning 'trigger_agent_chat_reply failed: %', sqlerrm;
  begin
    perform public.notify_ops('pulse_broken',
      jsonb_build_object('reason', sqlerrm, 'conversation_id', new.conversation_id));
  exception when others then null; end;
  return new;
end;
$function$;
