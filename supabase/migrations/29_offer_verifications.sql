-- =============================================
-- 29_offer_verifications.sql
-- 录取通知书验证表
-- 流程：用户在 app 内打码裁剪后上传 → AI 提取信息 → 24小时后删除原文件
-- =============================================

create table public.offer_verifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  screenshot_url text not null,
  status text default 'pending' check (status in ('pending', 'verified', 'rejected')),
  university_extracted text,
  program_extracted text,
  enrollment_year_extracted integer,
  ai_confidence text check (ai_confidence in ('high', 'medium', 'low')),
  rejection_reason text,
  submitted_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '24 hours'),
  deleted_at timestamptz
);

-- 每个用户只能有一条 pending 记录
create unique index one_pending_per_user
  on offer_verifications(user_id)
  where status = 'pending';

-- RLS
alter table public.offer_verifications enable row level security;

create policy "本人可查看自己的验证记录"
  on public.offer_verifications for select
  using (auth.uid() = user_id);

create policy "本人可提交验证"
  on public.offer_verifications for insert
  with check (auth.uid() = user_id);

create policy "系统可更新验证状态"
  on public.offer_verifications for update
  using (auth.uid() = user_id);
