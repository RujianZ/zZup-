-- =============================================================================
-- 72_ops_notifications.sql
-- 运维通知：数据库事件 → Discord
--
-- 链路：
--   触发器 → net.http_post → Edge Function `ops-notify` → Discord
--
-- 中间那层 Edge Function 是必需的：Discord 只认自己那套 embeds JSON，
-- 数据库原始载荷它直接拒收。而且 Discord 的 webhook URL 存在 Edge Function
-- 的 secret 里，**不落数据库**。
--
-- 鉴权：`ops-notify` 的 verify_jwt = false（调用方是数据库触发器，没有用户 JWT），
-- 改用共享密钥。密钥存在 Supabase Vault 里，触发器和函数各自去读，
-- 全程不需要任何人手工传递，也不出现在代码或聊天记录里。
--
-- ⚠️ 装 pg_net 的连带影响：
--    既有的 trigger_agent_chat_reply 一直因为「net schema 不存在」而抛异常
--    被静默吞掉。装了扩展之后它会**真的开始发 HTTP 请求** —— 但目标是
--    http://kong:8000（Supabase CLI 本地容器网关），托管环境不存在这个主机，
--    所以仍然会失败，只是失败点从"抛异常"变成"异步超时"。
--    net._http_response 表会积累失败记录。要彻底修好得改那个 URL，属 Ethan 那块。
--
-- 回滚：db-backups/2026-08-15/ROLLBACK_72.sql
-- =============================================================================

create extension if not exists pg_net;

-- ── 共享密钥（只在不存在时创建，避免重复执行时换掉正在用的密钥）────────────
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'ops_notify_key') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'ops_notify_key',
      '数据库触发器与 ops-notify Edge Function 之间的共享鉴权密钥'
    );
  end if;
end $$;

-- ── 密钥校验（供 Edge Function 调用）────────────────────────────────────────
-- 只回 true/false。密钥本身**永远不离开数据库** —— Edge Function 拿不到明文，
-- 就算它的日志泄露了也没用。
--
-- 不能让 Edge Function 直接查 vault.decrypted_secrets：vault 不在 PostgREST
-- 的暴露 schema 列表里，查出来恒为空，结果就是所有通知一律 401。
create or replace function public.verify_ops_key(p_key text)
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'ops_notify_key'
      and decrypted_secret = p_key
      and p_key is not null and p_key <> ''
  );
$function$;

revoke all on function public.verify_ops_key(text) from public, anon, authenticated;
grant execute on function public.verify_ops_key(text) to service_role;

-- ── 通用发送器 ───────────────────────────────────────────────────────────────
create or replace function public.notify_ops(p_event text, p_record jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_key text;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'ops_notify_key';

  if v_key is null then return; end if;

  perform net.http_post(
    url     := 'https://ulrzilxhuuxxezhgrptg.supabase.co/functions/v1/ops-notify',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-ops-key',    v_key),
    body    := jsonb_build_object('event', p_event, 'record', p_record)
  );
exception when others then
  -- 通知失败**绝不能**影响业务写入：举报已经落库了，Discord 挂了不该让用户提交失败。
  -- 但也不静默 —— 写进 Postgres 日志，出问题查得到。
  raise warning 'notify_ops(%) failed: %', p_event, sqlerrm;
end;
$function$;

-- ── 新举报 ───────────────────────────────────────────────────────────────────
create or replace function public.trg_notify_report()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  perform public.notify_ops('report', to_jsonb(new));
  return new;
end;
$function$;

drop trigger if exists on_report_created on public.reports;
create trigger on_report_created
  after insert on public.reports
  for each row execute function public.trg_notify_report();

-- ── 新用户注册 ───────────────────────────────────────────────────────────────
create or replace function public.trg_notify_signup()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  perform public.notify_ops('signup', jsonb_build_object(
    'id', new.id, 'zzup_id', new.zzup_id, 'real_name', new.real_name));
  return new;
end;
$function$;

drop trigger if exists on_profile_created on public.profiles;
create trigger on_profile_created
  after insert on public.profiles
  for each row execute function public.trg_notify_signup();

-- ── 账号删除（deleted_at 由 null 变为非 null）────────────────────────────────
create or replace function public.trg_notify_deletion()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    perform public.notify_ops('deletion', jsonb_build_object(
      'id', new.id, 'zzup_id', new.zzup_id));
  end if;
  return new;
end;
$function$;

drop trigger if exists on_profile_deleted on public.profiles;
create trigger on_profile_deleted
  after update on public.profiles
  for each row execute function public.trg_notify_deletion();
