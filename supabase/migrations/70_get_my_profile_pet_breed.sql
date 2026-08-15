-- =============================================================================
-- 70_get_my_profile_pet_breed.sql
-- get_my_profile 补返回 pet_breed
--
-- 背景：`pet_breed` 是迁移 58 加的列，而 `get_my_profile` 是迁移 25 写的，
-- 用的是显式 json_build_object，**没跟着更新** —— 于是客户端读到的 profile
-- 里根本没有这个字段。
--
-- 后果：所有读 `profile.pet_breed` 的地方都拿到 undefined，退化到兜底值 'dog'：
--   · 匹配等待页给外星人宠物画一只狗（实测：标题 "Zorp is looking…" 名字是对的，
--     只有 breed 丢了 —— 说明 profile 已加载，就是缺这个字段）
--   · ProfileScreen 的 currentPetBreed、Closet 里的形态预览
--   · ChatScreen 自己宠物头像的兜底分支
--   · FreeTravelScreen 发布页的宠物头像
--
-- 注意：zZuPer Talk 的 AI 人格**不受影响** —— pet-chat 函数自己会从数据库读
-- profile，客户端传的 breed 只是覆盖值。所以猫依然会 Nya~，但界面画的是狗。
--
-- 纯读取契约补齐：不动表结构/数据/RLS，不碰 Edge Function。
-- 回滚：db-backups/2026-08-14/ROLLBACK_70.sql
-- =============================================================================

create or replace function public.get_my_profile()
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    'pet_breed', p.pet_breed,                      -- ← 迁移 70 补上
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
