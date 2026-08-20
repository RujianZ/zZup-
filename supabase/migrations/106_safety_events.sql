-- 106 · safety_events —— 只在「有事」时才产生的那一行
--
-- 这张表**预期永远是 0 行到个位数**。它不是打分表，不是日志表。
--
-- 只有一种情况会写进来：内容审核命中 sexual/minors。其余 12 个类别拦了就拦了，
-- 不留痕、不通知、不处罚（Joe 2026-08-20 定）。
--
-- 为什么 Discord 之外还要这一行（Joe 问过）：
--   · Discord 消息会被删、webhook 会失效，而且我们控制不了它的保留策略
--   · 18 U.S.C. §2258A(h) 要求上报后**保存一年** ——
--     「它在我们的 Discord 里」对一个法定保存义务是很弱的答案
-- 所以：Discord 负责「马上有人知道」，这张表负责「一年后还查得到」。
--
-- ⚠️ 客户端对这张表零权限：RLS 打开 + **零策略** = 谁都读不到、写不进，
--    只有 SECURITY DEFINER 函数和 service_role 能碰。

create table if not exists public.safety_events (
  id            uuid primary key default gen_random_uuid(),

  -- 谁。不加外键：这一行要在账号被删之后仍然存在（法定保存期一年）。
  actor_id      uuid,
  actor_zzup_id text,

  -- 哪个表面、命中什么
  surface       text not null check (surface in ('profile','roam','pulse','pet_image','chat_image','attachment')),
  category      text not null,
  scores        jsonb not null default '{}'::jsonb,

  -- 证据。**只有这一类才存**，因为只有它需要向 NCMEC 说明。
  text_excerpt  text,
  storage_path  text,

  -- 服务端抓的网络信息（迁移 105 的 client_meta）。执法机关第一个要的就是它。
  network       jsonb not null default '{}'::jsonb,

  -- 处理状态。人工认定之前一律 open —— **没有自动封号**。
  status        text not null default 'open'
                check (status in ('open','confirmed','dismissed','reported')),
  handled_by    uuid,
  handled_at    timestamptz,
  note          text,

  -- 上报之后的保存期从这里开始算（§2258A(h)：一年）
  reported_at   timestamptz,

  created_at    timestamptz not null default now()
);

comment on table public.safety_events is
  '内容审核命中 sexual/minors 时的留证行。预期永远接近 0 行。其余类别拦了不留痕。客户端零权限。';
comment on column public.safety_events.status is
  'open=等人工认定（默认，没有自动封号）· confirmed=认定属实 · dismissed=误报 · reported=已向 NCMEC 上报';

create index if not exists safety_events_open_idx
  on public.safety_events (created_at desc) where status = 'open';

alter table public.safety_events enable row level security;
-- 有意不建任何策略：RLS 开启 + 零策略 = 客户端一行也读不到、写不进。

revoke all on public.safety_events from anon, authenticated;
