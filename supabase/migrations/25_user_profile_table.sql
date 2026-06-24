-- =============================================================================
-- 25_user_profile_table.sql  (v3 重构 · 对齐 decision_tree_v3)
--
-- 删除(树外):location_sharing, region, ranking_opt_in, ranking_identity_mode,
--             identity_mode, show_date_of_birth/_nationality/_qr_code,
--             以及对 explorations.active_title 的依赖
-- 新增:gender, onboarded, deleted_at(soft delete), pet_stage(幼/青/成),
--       搜索可见性 + 添加好友途径 + 通知开关
-- 命名:zzup_id(原 sudo_id)—— App 已改名 zZuP!
-- 语义:profile_visibility 即 S_A(real=人 / pet=宠 / real_with_pet=同框)
-- 红线:date_of_birth、personal_email 永不对外(对外仅给精确年龄)
-- 留空:向量/AI 一律不在本文件(见 docs/DEFERRED.md)
-- =============================================================================

drop function if exists public.get_my_profile();
drop function if exists public.get_other_profile(uuid);
drop function if exists public.add_xp(uuid, integer);
drop function if exists public.pet_quota(integer);
drop table if exists public.profiles cascade;
drop sequence if exists public.zzup_id_seq;

-- zzup_id:故意顺序自增,首位用户得 00001(稀缺性设计)
create sequence public.zzup_id_seq start 1;

create table public.profiles (
  id                      uuid references auth.users on delete cascade primary key,
  zzup_id                 text unique default lpad(nextval('zzup_id_seq')::text, 5, '0'),

  -- ── 真人身份 ──────────────────────────────────────────────
  real_name               text,
  bio                     text,
  avatar_url              text,
  qr_code_url             text,
  date_of_birth           date,                          -- 红线:永不对外,仅算年龄
  gender                  text check (gender in ('male','female','nonbinary','undisclosed')),
  nationality             text,
  university              text,
  personal_email          text unique,                   -- 红线:永不对外
  personal_email_verified boolean default false,
  edu_email               text unique,
  edu_verified            boolean default false,

  -- ── 宠物身份(一账号一只)──────────────────────────────────
  pet_name                text,
  pet_avatar_url          text,
  pet_bio                 text,
  pet_level               integer default 1,
  pet_xp                  integer default 0,
  pet_stage               text default 'child'
                            check (pet_stage in ('child','youth','adult')),

  -- ── S_A 展示身份(人/宠/同框)──────────────────────────────
  profile_visibility      text not null default 'real_with_pet'
                            check (profile_visibility in ('real_only','real_with_pet','pet_only')),

  -- ── 隐私:搜索可见性 ──────────────────────────────────────
  searchable_by_real_name boolean not null default true, -- 真名模糊搜索开关(zzup_id/UUID 永远精确可搜)

  -- ── 添加好友途径(真人身份;宠物身份不可加好友)────────────
  allow_add_via_search    boolean not null default true,
  allow_add_via_qr        boolean not null default true,
  allow_add_via_profile   boolean not null default true,

  -- ── 通知推送开关 ──────────────────────────────────────────
  notify_driftbottle      boolean not null default true,
  notify_petchat          boolean not null default true,
  notify_friend           boolean not null default true,
  notify_dm               boolean not null default true,
  notify_group            boolean not null default true,

  -- ── 生命周期 ──────────────────────────────────────────────
  onboarded               boolean not null default false,
  deleted_at              timestamptz,
  created_at              timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Profiles rows are visible to logged in users"
  on public.profiles for select using (auth.uid() is not null);
create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);
create policy "Users can delete own profile"
  on public.profiles for delete using (auth.uid() = id);

-- ── 列级权限 ────────────────────────────────────────────────
revoke all on public.profiles from authenticated;
revoke all on public.profiles from anon;

grant select (
  id, zzup_id,
  real_name, bio, avatar_url,
  pet_name, pet_avatar_url, pet_bio, pet_level, pet_stage,
  university, edu_verified,
  profile_visibility, deleted_at, created_at
) on public.profiles to authenticated;

grant update (
  real_name, bio, avatar_url, qr_code_url,
  date_of_birth, gender, nationality, university,
  personal_email, edu_email,
  pet_name, pet_avatar_url, pet_bio,
  profile_visibility,
  searchable_by_real_name,
  allow_add_via_search, allow_add_via_qr, allow_add_via_profile,
  notify_driftbottle, notify_petchat, notify_friend, notify_dm, notify_group,
  onboarded
) on public.profiles to authenticated;

grant insert, delete on public.profiles to authenticated;

-- =============================================================================
-- pet_quota(level) — 漂流瓶配额:幼1 / 青3 / 成5
-- =============================================================================
create or replace function public.pet_quota(p_level integer)
returns integer language sql immutable as $$
  select case when p_level >= 60 then 5 when p_level >= 30 then 3 else 1 end;
$$;
grant execute on function public.pet_quota(integer) to authenticated;

-- =============================================================================
-- add_xp(user_id, xp) — 原子加经验 + 维护等级/阶段(不衰减)
-- XP 曲线为占位(见 docs/DEFERRED.md #4)
-- =============================================================================
create or replace function public.add_xp(p_user_id uuid, p_xp integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_level integer;
begin
  update public.profiles
  set pet_xp = pet_xp + p_xp
  where id = p_user_id
  returning floor((pet_xp) / 100) + 1 into v_level;

  update public.profiles
  set pet_level = v_level,
      pet_stage = case when v_level >= 60 then 'adult'
                       when v_level >= 30 then 'youth'
                       else 'child' end
  where id = p_user_id;
end;
$$;
grant execute on function public.add_xp(uuid, integer) to authenticated;

-- =============================================================================
-- get_my_profile() — 本人完整资料(全字段)
-- =============================================================================
create or replace function public.get_my_profile()
returns json language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if auth.uid() is null then return null; end if;
  select * into p from public.profiles where id = auth.uid();
  if not found then return null; end if;

  return json_build_object(
    'id', p.id, 'zzup_id', p.zzup_id,
    'real_name', p.real_name, 'bio', p.bio, 'avatar_url', p.avatar_url,
    'qr_code_url', p.qr_code_url,
    'date_of_birth', p.date_of_birth,
    'age', case when p.date_of_birth is null then null
                else extract(year from age(p.date_of_birth))::int end,
    'gender', p.gender, 'nationality', p.nationality, 'university', p.university,
    'personal_email', p.personal_email, 'personal_email_verified', p.personal_email_verified,
    'edu_email', p.edu_email, 'edu_verified', p.edu_verified,
    'pet_name', p.pet_name, 'pet_avatar_url', p.pet_avatar_url, 'pet_bio', p.pet_bio,
    'pet_level', p.pet_level, 'pet_xp', p.pet_xp, 'pet_stage', p.pet_stage,
    'pet_quota', public.pet_quota(p.pet_level),
    'profile_visibility', p.profile_visibility,
    'searchable_by_real_name', p.searchable_by_real_name,
    'allow_add_via_search', p.allow_add_via_search,
    'allow_add_via_qr', p.allow_add_via_qr,
    'allow_add_via_profile', p.allow_add_via_profile,
    'notify_driftbottle', p.notify_driftbottle, 'notify_petchat', p.notify_petchat,
    'notify_friend', p.notify_friend, 'notify_dm', p.notify_dm, 'notify_group', p.notify_group,
    'onboarded', p.onboarded, 'deleted_at', p.deleted_at, 'created_at', p.created_at
  );
end;
$$;
grant execute on function public.get_my_profile() to authenticated;

-- =============================================================================
-- get_other_profile(target) — 按对方 S_A 过滤
-- 永不外泄:personal_email, date_of_birth(只给 age), 各开关, 已删账号
-- =============================================================================
create or replace function public.get_other_profile(target_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare p public.profiles; is_pet_only boolean; is_real_only boolean;
begin
  if auth.uid() is null then return null; end if;
  select * into p from public.profiles where id = target_id;
  if not found or p.deleted_at is not null then return null; end if;

  is_pet_only  := (p.profile_visibility = 'pet_only');
  is_real_only := (p.profile_visibility = 'real_only');

  return json_build_object(
    'id', p.id, 'zzup_id', p.zzup_id,
    'profile_visibility', p.profile_visibility,
    'edu_verified', p.edu_verified, 'created_at', p.created_at,
    'real_name',   case when is_pet_only then null else p.real_name end,
    'bio',         case when is_pet_only then null else p.bio end,
    'avatar_url',  case when is_pet_only then null else p.avatar_url end,
    'university',  case when is_pet_only then null else p.university end,
    'nationality', case when is_pet_only then null else p.nationality end,
    'gender',      case when is_pet_only then null else p.gender end,
    'age',         case when is_pet_only or p.date_of_birth is null then null
                        else extract(year from age(p.date_of_birth))::int end,
    'qr_code_url', case when is_pet_only or not p.allow_add_via_qr then null else p.qr_code_url end,
    'pet_name',       case when is_real_only then null else p.pet_name end,
    'pet_avatar_url', case when is_real_only then null else p.pet_avatar_url end,
    'pet_bio',        case when is_real_only then null else p.pet_bio end,
    'pet_level',      case when is_real_only then null else p.pet_level end,
    'pet_stage',      case when is_real_only then null else p.pet_stage end
  );
end;
$$;
grant execute on function public.get_other_profile(uuid) to authenticated;
