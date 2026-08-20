-- 105 · 举报要带上真实 IP
--
-- 为什么需要：举报是封号的唯一来源，而涉及 CSAM 的举报要向 NCMEC 上报 ——
-- 执法机关第一个问的就是「谁、从哪个 IP」。自填的姓名生日没有证据价值。
--
-- Supabase 的 auth 日志确实记了 IP（实测 remote_addr 每条请求都有），
-- 但**免费版只留 1 天**（Pro 7 天），而且在 SQL 里查不到。
-- 等我们人工认定完再去翻，日志早滚掉了。
--
-- 用哪个头：**cf-connecting-ip**。x-forwarded-for 客户端可以在前面塞假值，
-- cf-connecting-ip 是 Cloudflare 覆写的，伪造不了。
--
-- 实测（临时函数 + curl，验完即删）PostgREST 传给 Postgres 的头部里有：
--   cf-connecting-ip = 68.160.164.206   x-forwarded-for = 同上
--   cf-ipcountry = US                   user-agent = ...

drop function if exists public.debug_request_headers();

create or replace function public.client_meta()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$
declare h jsonb; v_ip text;
begin
  h := current_setting('request.headers', true)::jsonb;
  if h is null then return '{}'::jsonb; end if;
  -- 顺序有意为之：cf-connecting-ip 可信，x-forwarded-for 只是兜底
  v_ip := coalesce(h->>'cf-connecting-ip', split_part(h->>'x-forwarded-for', ',', 1));
  return jsonb_strip_nulls(jsonb_build_object(
    'ip', v_ip, 'country', h->>'cf-ipcountry',
    'user_agent', left(coalesce(h->>'user-agent',''), 300), 'at', now()));
exception when others then return '{}'::jsonb;
end; $$;

comment on function public.client_meta() is
  '当前 PostgREST 请求的 IP / 国家 / UA。触发器和定时任务里调用会返回 {}。IP 取 cf-connecting-ip（Cloudflare 覆写，不可伪造）。';

-- submit_report 只改了一处：context 里多一个 network 键。
-- 完整定义见线上 pg_get_functiondef —— 这里只记改动点，避免抄错正文：
--
--     'client',  coalesce(p_client_info, '{}'::jsonb),
--  +  'network', public.client_meta()
--
-- client 那项是客户端自报的，不可信；network 是服务端读头部拿的。
-- ⚠️ 实际迁移通过 apply_migration 上了完整的 create or replace，
--    改这个函数前务必先 pg_get_functiondef 拉线上定义当基线。
