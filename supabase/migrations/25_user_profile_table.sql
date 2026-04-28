-- =============================================================================
-- 25_user_profile_table.sql (rewritten 2026-04-17)
--
-- Consolidates prior migrations into a single authoritative file:
--   - Original profiles table
--   - Migration 54 (profile_visibility + show_* columns)
--   - Migration 55 (column-level UPDATE protection)
--   - NEW: column-level SELECT protection (修复清单 issue #2)
--   - NEW: get_my_profile() / get_other_profile() RPCs
--     (server-side privacy filter replacing JS-layer filter in auth.ts)
--
-- NOTE: DROP CASCADE on profiles nukes all downstream tables.
-- After running this migration, re-run 26-46 to rebuild the rest of the schema.
-- =============================================================================

-- Cleanup
drop function if exists public.get_my_profile();
drop function if exists public.get_other_profile(uuid);
drop function if exists public.add_xp(uuid, integer);
drop table if exists public.profiles cascade;
drop sequence if exists public.sudo_id_seq;

-- Let RPCs below reference explorations (not yet created at this point).
-- Resolution is deferred to execution time.
set local check_function_bodies = off;

-- =============================================================================
-- sudo_id sequence
-- INTENTIONALLY sequential — first user gets 00001 as a scarcity design
-- (see 修复清单 2026-04-17 "设计决策")
-- =============================================================================

create sequence public.sudo_id_seq start 1;

-- =============================================================================
-- profiles table
-- =============================================================================

create table public.profiles (
  id                      uuid references auth.users on delete cascade primary key,
  sudo_id                 text unique default lpad(nextval('sudo_id_seq')::text, 5, '0'),
  real_name               text,
  bio                     text,
  avatar_url              text,
  qr_code_url             text,
  date_of_birth           date,
  nationality             text,
  region                  text,
  university              text,
  personal_email          text unique,
  personal_email_verified boolean default false,
  edu_email               text unique,
  edu_verified            boolean default false,
  pet_name                text,
  pet_avatar_url          text,
  pet_bio                 text,
  pet_level               integer default 1,
  pet_xp                  integer default 0,
  identity_mode           text default 'real' check (identity_mode in ('real', 'pet')),
  location_sharing        text default 'fuzzy' check (location_sharing in ('precise', 'fuzzy', 'off')),
  ranking_opt_in          boolean default false,
  ranking_identity_mode   text default 'real' check (ranking_identity_mode in ('real', 'pet')),
  profile_visibility      text not null default 'real_with_pet'
    check (profile_visibility in ('real_only', 'real_with_pet', 'pet_only')),
  show_date_of_birth      boolean not null default false,
  show_nationality        boolean not null default false,
  show_qr_code            boolean not null default false,
  created_at              timestamptz default now()
);

alter table public.profiles enable row level security;

-- =============================================================================
-- Row-level policies (table-level SELECT still "any logged-in",
-- column-level GRANTs below do the actual filtering)
-- =============================================================================

create policy "Profiles rows are visible to logged in users"
  on public.profiles for select using (auth.uid() is not null);

create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users can delete own profile"
  on public.profiles for delete using (auth.uid() = id);

-- =============================================================================
-- Column-level privileges
--
-- SELECT: only columns safe to expose in JOINs (posts/messages/friends feeds).
--   For full / filtered profile reads, clients MUST use the RPCs below.
--
-- UPDATE: only columns the user may self-edit.
--   Protected: edu_verified, pet_xp, pet_level, sudo_id,
--              personal_email_verified, id, created_at
-- =============================================================================

revoke all on public.profiles from authenticated;
revoke all on public.profiles from anon;

-- Safe-for-direct-select (used by JOINs in posts/messages/friends/location)
grant select (
  id, sudo_id,
  real_name, bio, avatar_url,
  pet_name, pet_avatar_url, pet_bio, pet_level, pet_xp,
  university,
  edu_verified,
  identity_mode,
  profile_visibility,
  created_at
) on public.profiles to authenticated;

-- User-editable columns
grant update (
  real_name, bio, avatar_url, qr_code_url,
  date_of_birth, nationality, region, university,
  personal_email, edu_email,
  pet_name, pet_avatar_url, pet_bio,
  identity_mode, location_sharing,
  ranking_opt_in, ranking_identity_mode,
  profile_visibility,
  show_date_of_birth, show_nationality, show_qr_code
) on public.profiles to authenticated;

-- INSERT / DELETE: RLS-controlled; needs table-level grant
grant insert, delete on public.profiles to authenticated;

-- =============================================================================
-- RPC: get_my_profile()
-- Returns the caller's full profile (all fields), including active_title.
-- Replaces the JS-layer `select * from profiles where id = auth.uid()` pattern,
-- which would now fail due to revoked SELECT on sensitive columns.
-- =============================================================================

create or replace function public.get_my_profile()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles;
  active_title_val text;
begin
  if auth.uid() is null then return null; end if;

  select * into p from public.profiles where id = auth.uid();
  if not found then return null; end if;

  select active_title into active_title_val
  from public.explorations
  where user_id = auth.uid() and active_title is not null
  limit 1;

  return json_build_object(
    'id', p.id,
    'sudo_id', p.sudo_id,
    'real_name', p.real_name,
    'bio', p.bio,
    'avatar_url', p.avatar_url,
    'qr_code_url', p.qr_code_url,
    'date_of_birth', p.date_of_birth,
    'nationality', p.nationality,
    'region', p.region,
    'university', p.university,
    'personal_email', p.personal_email,
    'personal_email_verified', p.personal_email_verified,
    'edu_email', p.edu_email,
    'edu_verified', p.edu_verified,
    'pet_name', p.pet_name,
    'pet_avatar_url', p.pet_avatar_url,
    'pet_bio', p.pet_bio,
    'pet_level', p.pet_level,
    'pet_xp', p.pet_xp,
    'identity_mode', p.identity_mode,
    'location_sharing', p.location_sharing,
    'ranking_opt_in', p.ranking_opt_in,
    'ranking_identity_mode', p.ranking_identity_mode,
    'profile_visibility', p.profile_visibility,
    'show_date_of_birth', p.show_date_of_birth,
    'show_nationality', p.show_nationality,
    'show_qr_code', p.show_qr_code,
    'created_at', p.created_at,
    'active_title', active_title_val
  );
end;
$$;

grant execute on function public.get_my_profile() to authenticated;

-- =============================================================================
-- RPC: get_other_profile(target_id)
-- Returns target's profile filtered by their privacy settings.
--
-- NEVER returned to others (regardless of privacy settings):
--   personal_email, edu_email, personal_email_verified, region,
--   location_sharing, ranking_opt_in, ranking_identity_mode,
--   show_date_of_birth, show_nationality, show_qr_code
--
-- Conditional fields:
--   - Real identity (real_name, bio, avatar_url, university) → hidden if pet_only
--   - date_of_birth → hidden if pet_only OR show_date_of_birth=false
--   - nationality   → hidden if pet_only OR show_nationality=false
--   - qr_code_url   → hidden if pet_only OR show_qr_code=false
--   - Pet identity (pet_name, pet_avatar_url, pet_bio, pet_level, pet_xp) → hidden if real_only
-- =============================================================================

create or replace function public.get_other_profile(target_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles;
  active_title_val text;
  is_pet_only boolean;
  is_real_only boolean;
begin
  if auth.uid() is null then return null; end if;

  select * into p from public.profiles where id = target_id;
  if not found then return null; end if;

  is_pet_only  := (p.profile_visibility = 'pet_only');
  is_real_only := (p.profile_visibility = 'real_only');

  select active_title into active_title_val
  from public.explorations
  where user_id = target_id and active_title is not null
  limit 1;

  return json_build_object(
    -- Always public
    'id', p.id,
    'sudo_id', p.sudo_id,
    'identity_mode', p.identity_mode,
    'profile_visibility', p.profile_visibility,
    'edu_verified', p.edu_verified,
    'created_at', p.created_at,
    'active_title', active_title_val,
    -- Real identity (hidden if pet_only)
    'real_name',     case when is_pet_only then null else p.real_name end,
    'bio',           case when is_pet_only then null else p.bio end,
    'avatar_url',    case when is_pet_only then null else p.avatar_url end,
    'university',    case when is_pet_only then null else p.university end,
    -- Opt-in fields (hidden if pet_only OR toggle off)
    'date_of_birth', case when is_pet_only or not p.show_date_of_birth then null else p.date_of_birth end,
    'nationality',   case when is_pet_only or not p.show_nationality  then null else p.nationality end,
    'qr_code_url',   case when is_pet_only or not p.show_qr_code      then null else p.qr_code_url end,
    -- Pet identity (hidden if real_only)
    'pet_name',       case when is_real_only then null else p.pet_name end,
    'pet_avatar_url', case when is_real_only then null else p.pet_avatar_url end,
    'pet_bio',        case when is_real_only then null else p.pet_bio end,
    'pet_level',      case when is_real_only then null else p.pet_level end,
    'pet_xp',         case when is_real_only then null else p.pet_xp end
  );
end;
$$;

grant execute on function public.get_other_profile(uuid) to authenticated;

-- =============================================================================
-- RPC: add_xp(user_id, xp) — atomic XP + level update
-- Runs as postgres (SECURITY DEFINER), bypasses column-level GRANTs.
-- =============================================================================

create or replace function public.add_xp(p_user_id uuid, p_xp integer)
returns void
language plpgsql
security definer
as $$
begin
  update public.profiles
  set
    pet_xp    = pet_xp + p_xp,
    pet_level = floor((pet_xp + p_xp) / 100) + 1
  where id = p_user_id;
end;
$$;

grant execute on function public.add_xp(uuid, integer) to authenticated;
