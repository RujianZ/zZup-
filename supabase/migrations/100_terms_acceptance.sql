-- 100_terms_acceptance.sql —— 条款同意：记录 + 服务端强制
--
-- 已于 2026-08-18 应用到云端（Supabase MCP apply_migration）。
-- 回滚：db-backups/2026-08-19/ROLLBACK_100.sql
--
-- 为什么强制层是触发器而不是 RLS：Edge Function 走 service_role，绕过 RLS
-- 但绕不过触发器。跟迁移 75（年龄门）、91/92（陌生人开关）同一套路。
--
-- Google Play 的 UGC 政策原文要求「上传 UGC 之前先接受条款」——
-- 这四个触发器就是那句话的实现，不是界面上那个勾选框。

alter table public.profiles
  add column if not exists terms_accepted_at  timestamptz,
  add column if not exists terms_version      text,
  add column if not exists guidelines_version text,
  add column if not exists privacy_version    text;

comment on column public.profiles.terms_accepted_at is
  '用户点「同意并继续」的服务端时间。null = 从未同意过，会被写入守卫挡住。';

-- ─── 判据 ────────────────────────────────────────────────────────────────
create or replace function public.has_accepted_terms(p_account uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(
    (select terms_accepted_at is not null from public.profiles where id = p_account),
    false);
$$;

-- ─── 写入：时间戳一律服务端盖，不收客户端传的时间 ──────────────────────────
create or replace function public.accept_terms(
  p_terms_version      text,
  p_guidelines_version text,
  p_privacy_version    text
)
returns timestamptz
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_at  timestamptz := now();
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- 版本号是这条记录的全部意义所在，空的等于没记
  if coalesce(btrim(p_terms_version), '') = ''
     or coalesce(btrim(p_guidelines_version), '') = ''
     or coalesce(btrim(p_privacy_version), '') = '' then
    raise exception 'Document version is required' using errcode = '22023';
  end if;

  update public.profiles
     set terms_accepted_at  = v_at,
         terms_version      = btrim(p_terms_version),
         guidelines_version = btrim(p_guidelines_version),
         privacy_version    = btrim(p_privacy_version)
   where id = v_uid;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  return v_at;
end;
$$;

revoke all on function public.accept_terms(text, text, text) from public, anon;
grant execute on function public.accept_terms(text, text, text) to authenticated;
revoke all on function public.has_accepted_terms(uuid) from public, anon;
grant execute on function public.has_accepted_terms(uuid) to authenticated;

-- ─── 强制：四个写入点 ────────────────────────────────────────────────────
-- ⚠️ 判定读**行自己的人物列**，不读 auth.uid() —— service_role 写入时 uid 是 null。
--    实测 messages 全部 257 行（含 ai_pet / ai_proxy）的 sender_id 都非空，
--    所以 AI 代发的消息也被同一条规则覆盖：主人没同意，他的宠物也不能替他说话。
create or replace function public.enforce_terms_accepted()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_account uuid;
begin
  case tg_table_name
    when 'messages'         then v_account := new.sender_id;
    when 'travel_posts'     then v_account := new.user_id;
    when 'travel_comments'  then v_account := new.author_id;
    when 'match_queue' then
      -- 只管入队，取消/完成之类的状态流转不拦
      if new.status is distinct from 'waiting' then return new; end if;
      v_account := new.user_id;
    else
      return new;
  end case;

  -- sender_id 可能是 null（删号后 ON DELETE SET NULL），归属不明就不拦
  if v_account is not null and not public.has_accepted_terms(v_account) then
    raise exception 'You must accept the Terms of Service before posting or messaging.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists on_message_check_terms      on public.messages;
drop trigger if exists trg_terms_travel_posts      on public.travel_posts;
drop trigger if exists trg_terms_travel_comments   on public.travel_comments;
drop trigger if exists trg_terms_match_queue       on public.match_queue;

create trigger on_message_check_terms
  before insert on public.messages
  for each row execute function public.enforce_terms_accepted();

create trigger trg_terms_travel_posts
  before insert on public.travel_posts
  for each row execute function public.enforce_terms_accepted();

create trigger trg_terms_travel_comments
  before insert on public.travel_comments
  for each row execute function public.enforce_terms_accepted();

create trigger trg_terms_match_queue
  before insert on public.match_queue
  for each row execute function public.enforce_terms_accepted();

-- ─── get_my_profile 补四个字段（App 靠它决定要不要弹同意屏）──────────────
-- 基线是 pg_get_functiondef 拉的**线上**定义，不是任何迁移文件里的文本
-- （8-16 那次 get_my_profile 全站挂掉就是照旧迁移文本改的）。
-- RETURNS json 没变，create or replace 安全，不会生成重载。
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
    'onboarded', p.onboarded, 'deleted_at', p.deleted_at, 'created_at', p.created_at,
    'terms_accepted_at', p.terms_accepted_at,
    'terms_version', p.terms_version,
    'guidelines_version', p.guidelines_version,
    'privacy_version', p.privacy_version
  );
end;
$function$;
