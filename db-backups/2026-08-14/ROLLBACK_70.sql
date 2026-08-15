-- =============================================================================
-- ROLLBACK_70.sql — 撤销 70_get_my_profile_pet_breed.sql
--
-- 把 get_my_profile 还原成不返回 pet_breed 的版本（快照取自云端 2026-08-14）。
--
-- ⚠️ 回滚后客户端所有读 profile.pet_breed 的地方会重新拿到 undefined，
-- 退化到兜底值 'dog' —— 外星人/猫/熊的宠物在界面上又会被画成狗。
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_my_profile()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

grant execute on function public.get_my_profile() to authenticated;

notify pgrst, 'reload schema';
