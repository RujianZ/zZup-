-- =============================================================================
-- ROLLBACK_73.sql — 撤销 73_identity_scoped_profiles.sql
--
-- 迁移 73 是纯附加的，回滚只需：
--   1. 删掉两个新函数
--   2. 把 get_other_profile 恢复成带 S_A 过滤的版本（迁移 64 的定义）
--
-- 不涉及任何数据变更，profile_visibility 列自始至终没动过。
--
-- 完整的改动前权限/函数正本见：
--   D:\zzup-supabase\backups\2026-08-15_pre-rls-lockdown\03_functions\all_functions.sql
-- =============================================================================

drop function if exists public.get_pet_identity(text, uuid, uuid);
drop function if exists public.pet_alias(uuid, uuid);

-- ── 恢复迁移 64 版本的 get_other_profile（带 S_A 过滤）────────────────────────
create or replace function public.get_other_profile(target_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    'pet_stage',      case when is_real_only then null else p.pet_stage end,
    'pet_breed',      case when is_real_only then null else p.pet_breed end
  );
end;
$function$;

grant execute on function public.get_other_profile(uuid) to authenticated;

notify pgrst, 'reload schema';
