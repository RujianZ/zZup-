-- 119_push_tokens_and_dm_push.sql
--
-- 私聊 DM 的推送通知：存设备令牌的表 + messages 上的触发器。
--
-- ─── 为什么是一张表而不是 profiles 上一列 ────────────────────────────────
-- 一个人可能同时装在手机和平板上，令牌是**每设备一个**，不是每账号一个。
-- 而且令牌会失效（重装 App、系统回收），失效时要能单独删掉那一行而不动别的设备。
--
-- ─── 推送内容里放什么（Joe 2026-08-29 拍板）──────────────────────────────
--   放：发件人显示名 + "Sent you a message / photo / voice message"
--   不放：消息内容一个字都不放
-- 理由：推送要经过 Expo → Apple/Google，载荷在他们那里不是端到端加密的。
-- 显示发件人是所有 IM 的标准做法，用户需要它；但内容不出去，
-- 跟 moderate-content 里那条「私聊内容一律不经过外部管道」的立场一致。
-- ⚠️ 代价要在隐私政策里说清楚：Expo / Google / Apple 会知道
-- 「谁在什么时候给谁发了消息」这层元数据。任何有推送的 App 都一样。

-- ── 1. 设备令牌表 ───────────────────────────────────────────────────────

create table if not exists public.push_tokens (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references auth.users(id) on delete cascade,
  -- Expo push token，形如 ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]
  token        text not null unique,
  platform     text not null check (platform in ('ios', 'android')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

comment on table public.push_tokens is
  '每设备一行的 Expo 推送令牌。令牌失效（DeviceNotRegistered）时由 send-push 直接删行。';

create index if not exists push_tokens_account_idx on public.push_tokens (account_id);

alter table public.push_tokens enable row level security;

-- 只能看/写自己的。service_role 绕过 RLS，send-push 用它查收件人的令牌。
drop policy if exists push_tokens_own_select on public.push_tokens;
create policy push_tokens_own_select on public.push_tokens
  for select using (auth.uid() = account_id);

drop policy if exists push_tokens_own_insert on public.push_tokens;
create policy push_tokens_own_insert on public.push_tokens
  for insert with check (auth.uid() = account_id);

drop policy if exists push_tokens_own_update on public.push_tokens;
create policy push_tokens_own_update on public.push_tokens
  for update using (auth.uid() = account_id) with check (auth.uid() = account_id);

drop policy if exists push_tokens_own_delete on public.push_tokens;
create policy push_tokens_own_delete on public.push_tokens
  for delete using (auth.uid() = account_id);

-- ── 2. 客户端登记令牌用的 RPC ───────────────────────────────────────────
--
-- 为什么不让客户端直接 upsert：同一个令牌可能从 A 账号换到 B 账号
-- （同一台手机换人登录）。那种情况必须把旧行**改归属**而不是插新行，
-- 否则 unique(token) 会撞，而且旧主人会继续收到不属于他的推送。

create or replace function public.register_push_token(
  p_token    text,
  p_platform text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_token is null or p_token = '' then
    raise exception 'token required';
  end if;
  if p_platform not in ('ios', 'android') then
    raise exception 'platform must be ios or android';
  end if;

  insert into public.push_tokens (account_id, token, platform)
  values (auth.uid(), p_token, p_platform)
  on conflict (token) do update
    set account_id   = auth.uid(),   -- 换人登录同一台设备时改归属
        platform     = excluded.platform,
        last_seen_at = now();
end;
$$;

revoke all on function public.register_push_token(text, text) from public;
grant execute on function public.register_push_token(text, text) to authenticated;

-- 退出登录时调用 —— 不然下一个登录的人之前，前任还会收到推送
create or replace function public.unregister_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from public.push_tokens
   where token = p_token and account_id = auth.uid();
end;
$$;

revoke all on function public.unregister_push_token(text) from public;
grant execute on function public.unregister_push_token(text) to authenticated;

-- ── 3. messages 上的触发器 ──────────────────────────────────────────────
--
-- 形状照抄 trigger_agent_chat_reply（115 号迁移那版，线上已跑通）：
--   · 密钥从 vault 读，不硬编码
--   · 失败 raise warning + notify_ops，**绝不静默吞异常**
--     （08-28 那次 Pulse 挂掉三天没人知道，根因就是静默吞异常）
--   · 整个函数包在 exception handler 里 —— 推送发不出去绝不能让发消息失败
--
-- 触发器这一层只做**最便宜的过滤**（是不是 DM、是不是宠物会话），
-- 剩下的（谁该收、静音了没、开关关了没、有没有令牌）全在 send-push 里做，
-- 那边是 TypeScript，好写好测。

create or replace function public.notify_dm_push()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_kind      text;
  v_is_agent  boolean;
  v_caller    text;
  v_ops       text;
begin
  -- 只推私聊。Pack 群聊、Pulse（is_agent_chat）、宠物会话都不在本期范围。
  select kind, coalesce(is_agent_chat, false)
    into v_kind, v_is_agent
    from public.conversations
   where id = new.conversation_id;

  if v_kind is distinct from 'dm' or v_is_agent then
    return new;
  end if;

  -- 系统消息没有发件人，没人可署名，不推
  if new.sender_id is null then
    return new;
  end if;

  -- 网关的 verify_jwt 要 Authorization；send-push 自己再用 x-ops-key 认一次。
  -- ⚠️ agent_chat_caller_key 这个名字是历史遗留（115 号迁移起的），
  --    它其实就是 publishable key，不是秘密。存 vault 是为了轮换只改一处，
  --    所以这里**复用它而不是新建一个** —— 新建会让轮换点变成两个。
  select decrypted_secret into v_caller
    from vault.decrypted_secrets where name = 'agent_chat_caller_key';
  select decrypted_secret into v_ops
    from vault.decrypted_secrets where name = 'ops_notify_key';

  if v_caller is null or v_ops is null then
    raise warning 'notify_dm_push: vault 缺 key（caller=% ops=%），DM 推送停摆',
      (v_caller is not null), (v_ops is not null);
    perform public.notify_ops('push_broken',
      jsonb_build_object('reason', 'missing vault key for send-push'));
    return new;
  end if;

  perform net.http_post(
    url := 'https://ulrzilxhuuxxezhgrptg.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_caller,
      'apikey',        v_caller,
      'x-ops-key',     v_ops
    ),
    -- 只传 id。内容由 send-push 自己用 service role 查 ——
    -- 消息正文不经过 net.http_post 的日志，也不进 net._http_response。
    body := jsonb_build_object('message_id', new.id)
  );

  return new;
exception when others then
  raise warning 'notify_dm_push failed: %', sqlerrm;
  begin
    perform public.notify_ops('push_broken',
      jsonb_build_object('reason', sqlerrm, 'message_id', new.id));
  exception when others then null; end;
  return new;
end;
$$;

drop trigger if exists on_message_notify_push on public.messages;
create trigger on_message_notify_push
  after insert on public.messages
  for each row execute function public.notify_dm_push();
