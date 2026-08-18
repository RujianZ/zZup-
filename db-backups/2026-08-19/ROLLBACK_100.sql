-- ROLLBACK_100.sql —— 撤销 100_terms_acceptance.sql
--
-- ⚠️ 未实际执行验证过（跟 81/83-88 那批同样的标注）。
-- ⚠️ 会丢数据：terms_accepted_at 等四列被删除后，谁在什么时候同意了哪一版
--    这件事不可恢复。真要回滚先把这四列导出来：
--      copy (select id, terms_accepted_at, terms_version, guidelines_version,
--                   privacy_version from public.profiles
--             where terms_accepted_at is not null) to stdout with csv header;
--
-- 顺序：先拆触发器，再拆函数，最后拆列 —— 反过来会因为依赖报错。

drop trigger if exists on_message_check_terms    on public.messages;
drop trigger if exists trg_terms_travel_posts    on public.travel_posts;
drop trigger if exists trg_terms_travel_comments on public.travel_comments;
drop trigger if exists trg_terms_match_queue     on public.match_queue;

drop function if exists public.enforce_terms_accepted();
drop function if exists public.accept_terms(text, text, text);

-- has_accepted_terms 要在 enforce_terms_accepted 之后删（前者被后者调用）
drop function if exists public.has_accepted_terms(uuid);

alter table public.profiles
  drop column if exists terms_accepted_at,
  drop column if exists terms_version,
  drop column if exists guidelines_version,
  drop column if exists privacy_version;

-- get_my_profile 还原成迁移 100 之前的线上定义
-- （2026-08-18 用 pg_get_functiondef 逐字取的，不是从旧迁移文件抄的）
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
    'pet_breed', p.pet_breed,
    'pet_quota', public.pet_quota(p.pet_level),
    'searchable_by_real_name', p.searchable_by_real_name,
    'allow_add_via_search', p.allow_add_via_search,
    'allow_add_via_qr', p.allow_add_via_qr,
    'allow_add_via_profile', p.allow_add_via_profile,
    'allow_stranger_dm', p.allow_stranger_dm,
    'notify_driftbottle', p.notify_driftbottle, 'notify_petchat', p.notify_petchat,
    'notify_friend', p.notify_friend, 'notify_dm', p.notify_dm, 'notify_group', p.notify_group,
    'onboarded', p.onboarded, 'deleted_at', p.deleted_at, 'created_at', p.created_at
  );
end;
$function$;
