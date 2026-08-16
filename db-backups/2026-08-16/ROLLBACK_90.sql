-- =============================================================================
-- ROLLBACK_90.sql — 撤销 90_allow_stranger_dm.sql
--
-- 把 get_my_profile 和 create_dm 还原成迁移 70 / 迁移 27 的版本，并删掉新列。
--
-- ⚠️ 回滚之后：
--    1. 所有人的设置值一起消失（drop column 带走数据）。再装回来全部默认 true，
--       也就是**每个关掉过陌生人私信的人都会被重新打开**。
--       如果只是想临时停用，别 drop 列 —— 只跑下面「只还原 create_dm」那一段。
--    2. 官网 index.html / about.html 上的 "The stranger switch" 会重新变成
--       不实陈述。回滚的话，那两处文案要同步撤掉。
--    3. ProfileScreen 上的开关会写一个不存在的列 → 42501。客户端要一起回退。
-- =============================================================================

-- ── 只还原 create_dm（保留列和数据，仅停用判定）────────────────────────────
-- 想临时停用就跑到这一段为止，别往下跑。
create or replace function public.create_dm(p_target_id uuid, p_my_identity text, p_target_identity text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid(); v_a text; v_b text; v_key text; v_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_target_id = v_uid then raise exception 'Cannot DM yourself'; end if;
  if p_my_identity not in ('real','pet') or p_target_identity not in ('real','pet')
    then raise exception 'Invalid identity type'; end if;

  if exists (select 1 from public.blocked_users
             where blocker_id=v_uid and blocked_id=p_target_id and blocked_identity_type=p_target_identity)
     or exists (select 1 from public.blocked_users
             where blocker_id=p_target_id and blocked_id=v_uid and blocked_identity_type=p_my_identity)
    then raise exception 'Cannot start conversation'; end if;

  v_a := v_uid::text || ':' || p_my_identity;
  v_b := p_target_id::text || ':' || p_target_identity;
  v_key := case when v_a < v_b then v_a || '|' || v_b else v_b || '|' || v_a end;

  select id into v_id from public.conversations where kind='dm' and dm_key=v_key;
  if v_id is not null then return v_id; end if;

  begin
    insert into public.conversations (kind, dm_key, created_by) values ('dm', v_key, v_uid)
      returning id into v_id;
    insert into public.conversation_members (conversation_id, account_id, member_identity)
    values (v_id, v_uid, p_my_identity), (v_id, p_target_id, p_target_identity);
  exception when unique_violation then
    select id into v_id from public.conversations where kind='dm' and dm_key=v_key;
  end;
  return v_id;
end;
$function$;

-- ── 完整回滚：还原 get_my_profile（**迁移 74** 版本）并删列 ──────────────────
-- 基线是 74 不是 70：70 那版还带着 profile_visibility，而那一列在 74 已经删了，
-- 照 70 还原会让函数每次调用都 42703，全体用户卡在启动页。写迁移 90 时踩过一次。
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
    'pet_breed', p.pet_breed,
    'pet_quota', public.pet_quota(p.pet_level),
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

alter table public.profiles drop column if exists allow_stranger_dm;

notify pgrst, 'reload schema';
