-- =============================================
-- 25_profiles.sql
-- 用户资料主表
-- =============================================

-- sudo_id 序列（5位类QQ号）
create sequence if not exists sudo_id_seq start 10000 increment 1;

create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  sudo_id integer default nextval('sudo_id_seq') unique not null,
  real_name text not null default '',
  bio text,
  avatar_url text,
  qr_code_url text,
  date_of_birth date,
  nationality text,
  region text,
  university text not null default '',
  personal_email text,
  personal_email_verified boolean default false,
  edu_email text,
  edu_verified boolean default false,
  -- 宠物字段
  pet_name text,
  pet_avatar_url text,
  pet_bio text,
  pet_level integer default 1,
  pet_xp integer default 0,
  -- 位置分享
  location_sharing text default 'fuzzy' check (location_sharing in ('precise', 'fuzzy', 'off')),
  created_at timestamptz default now()
);

-- RLS
alter table public.profiles enable row level security;

create policy "所有人可查看用户资料"
  on public.profiles for select
  using (true);

create policy "本人可创建自己的资料"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "本人可更新自己的资料"
  on public.profiles for update
  using (auth.uid() = id);

create policy "本人可删除自己的资料"
  on public.profiles for delete
  using (auth.uid() = id);
