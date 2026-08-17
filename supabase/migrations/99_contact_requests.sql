-- 99_contact_requests.sql
--
-- 网站上的联系/删号表单落库。
--
-- 为什么要落库而不是只发邮件到 admin@zzup.org：
--   CA AB 1394（2025-01-01 生效）对删号/CSAM 类请求有硬期限 ——
--   **36 小时**内书面确认、每 **7 天**书面更新、**30 天**内处理完。
--   真被问到的时候，"翻 Gmail 发件箱" 不是证据链，一张带时间戳的表才是。
--   `acknowledged_at` 就是那个 36 小时的凭证。
--
-- 为什么不新开一个数据库（Joe 问过 MongoDB）：
--   隐私政策里逐条列了数据存在哪，现在写的是「Supabase，美东」。
--   加一个新的数据处理方 = 改隐私政策 + 苹果隐私标签 + Google 数据安全表
--   各多申报一项。为了一张表付这个代价不值。
--
-- 表里**不存 IP** —— 隐私政策的「What we collect」没有列它，
-- 存了就得改文书。限流改用「同一邮箱 + 时间窗」在 Edge Function 里做。
--
-- 回滚：db-backups/2026-08-18/ROLLBACK_99.sql

create table if not exists public.contact_requests (
  id              uuid primary key default gen_random_uuid(),

  category        text not null check (category in (
                    'delete_account',   -- 删除账号（Play Console 填的那个 URL 指向的场景）
                    'account',          -- 登录不上、改邮箱之类
                    'report',           -- 举报（App 内进不去时的兜底）
                    'partnership',      -- 合作
                    'acquisition',      -- 并购 / 投资
                    'press',            -- 媒体
                    'other'
                  )),

  email           text not null,        -- 提交人留的联系邮箱，回执发这里
  zzup_id         text,                 -- 选填，用户知道自己 ID 时能大幅加快处理
  message         text not null,

  status          text not null default 'open'
                    check (status in ('open','reviewing','actioned','dismissed')),

  -- AB 1394 的时间线证据
  acknowledged_at timestamptz,          -- 自动回执发出的时间（36 小时的凭证）
  handled_at      timestamptz,
  handled_by      uuid references public.profiles(id) on delete set null,
  resolution_note text,

  created_at      timestamptz not null default now()
);

comment on table public.contact_requests is
  '网站联系表单。acknowledged_at 是 CA AB 1394「36 小时内书面确认」的证据，别删。';

create index if not exists contact_requests_created_idx
  on public.contact_requests (created_at desc);
create index if not exists contact_requests_open_idx
  on public.contact_requests (status, created_at desc) where status = 'open';
-- 限流用：查「这个邮箱最近有没有提交过」
create index if not exists contact_requests_email_recent_idx
  on public.contact_requests (email, created_at desc);

-- RLS 全锁死：这张表只有 service_role（Edge Function）能读写。
-- 跟 reports 表一个待遇 —— 没有任何策略 = 任何客户端角色都碰不到。
alter table public.contact_requests enable row level security;

revoke all on public.contact_requests from anon, authenticated;
