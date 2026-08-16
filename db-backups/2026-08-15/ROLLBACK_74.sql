-- =============================================================================
-- ROLLBACK_74.sql — 撤销 74_drop_profile_visibility.sql
--
-- ⚠️ 这是本项目第一个**破坏性**迁移的回滚：74 删掉了 profiles.profile_visibility 列。
--    列里的原始值**无法从本脚本恢复** —— 它只把列加回来并填默认值 'real_with_pet'。
--
--    要恢复真实的原始值，从备份里取：
--      D:\zzup-supabase\backups\2026-08-15_pre-rls-lockdown\02_data\all_tables_data.json
--    该文件的 profiles 数组里每行都带 profile_visibility 原值（6 行）。
--    取值后逐行 update 即可，示例：
--      update public.profiles set profile_visibility = 'real_with_pet' where id = '<uuid>';
--
--    截至删除时全库 6 行，且**全部都是默认值 real_with_pet**（已核对），
--    所以实践中直接跑本脚本就等价于完全恢复。
--
-- 六个函数的改动前正本见：
--   D:\zzup-supabase\backups\2026-08-15_pre-rls-lockdown\03_functions\all_functions.sql
-- =============================================================================

-- ── 1. 把列加回来 ────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists profile_visibility text not null default 'real_with_pet';

alter table public.profiles drop constraint if exists profiles_profile_visibility_check;
alter table public.profiles add constraint profiles_profile_visibility_check
  check (profile_visibility in ('real_only','real_with_pet','pet_only'));

grant select (profile_visibility) on public.profiles to authenticated;
grant update (profile_visibility) on public.profiles to authenticated;

-- ── 2. 恢复六个函数（迁移 74 之前的定义）────────────────────────────────────

create or replace function public.get_my_profile()
returns json language plpgsql security definer set search_path to 'public'
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

create or replace function public.list_conversations()
returns table(conversation_id uuid, kind text, is_temporary boolean,
              expires_at timestamp with time zone, status text, my_identity text,
              peer_id uuid, display_name text, display_avatar text,
              display_breed text, display_stage text, members_count integer,
              last_message text, last_message_at timestamp with time zone)
language sql security definer set search_path to 'public'
as $function$
  with my_convs as (
    select cm.conversation_id, cm.member_identity as my_identity
    from public.conversation_members cm where cm.account_id = auth.uid()
  ),
  peer as (
    select cm.conversation_id, cm.account_id as peer_id, cm.member_identity as peer_identity
    from public.conversation_members cm
    join public.conversations c2 on c2.id = cm.conversation_id
    where cm.account_id <> auth.uid() and c2.kind in ('dm','petchat','driftbottle')
  ),
  last_msg as (
    select distinct on (m.conversation_id) m.conversation_id, m.content, m.created_at
    from public.messages m order by m.conversation_id, m.created_at desc
  )
  select
    c.id, c.kind, c.is_temporary, c.expires_at, c.status, mc.my_identity, pe.peer_id,
    case when c.kind='group' then c.name
         when c.kind='zzuper_talk' then me.pet_name
         when pe.peer_identity='pet' then pp.pet_name
         else pp.real_name end,
    case when c.kind='group' then c.avatar_url
         when c.kind='zzuper_talk' then me.pet_avatar_url
         when pe.peer_identity='pet' then pp.pet_avatar_url
         else pp.avatar_url end,
    case when c.kind='zzuper_talk' then me.pet_breed
         when pe.peer_identity='pet' and pp.profile_visibility <> 'real_only' then pp.pet_breed
         else null end,
    case when c.kind='zzuper_talk' then me.pet_stage
         when pe.peer_identity='pet' and pp.profile_visibility <> 'real_only' then pp.pet_stage
         else null end,
    c.members_count, lm.content, lm.created_at
  from my_convs mc
  join public.conversations c   on c.id = mc.conversation_id
  left join peer pe             on pe.conversation_id = c.id
  left join public.profiles pp  on pp.id = pe.peer_id
  left join public.profiles me  on me.id = auth.uid()
  left join last_msg lm         on lm.conversation_id = c.id
  where not (c.is_temporary and c.expires_at is not null and c.expires_at < now())
  order by coalesce(lm.created_at, c.created_at) desc;
$function$;

drop function if exists public.list_friends();
create function public.list_friends()
returns table(friendship_id uuid, id uuid, zzup_id text, profile_visibility text,
              real_name text, avatar_url text, university text, pet_name text,
              pet_avatar_url text, edu_verified boolean, pet_breed text, pet_stage text)
language sql security definer set search_path to 'public'
as $function$
  select f.id, p.id, p.zzup_id, p.profile_visibility,
    case when p.profile_visibility='pet_only'  then null else p.real_name end,
    case when p.profile_visibility='pet_only'  then null else p.avatar_url end,
    case when p.profile_visibility='pet_only'  then null else p.university end,
    case when p.profile_visibility='real_only' then null else p.pet_name end,
    case when p.profile_visibility='real_only' then null else p.pet_avatar_url end,
    p.edu_verified,
    case when p.profile_visibility='real_only' then null else p.pet_breed end,
    case when p.profile_visibility='real_only' then null else p.pet_stage end
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where f.status='accepted'
    and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
    and p.deleted_at is null;
$function$;
grant execute on function public.list_friends() to authenticated;

drop function if exists public.list_pending_requests();
create function public.list_pending_requests()
returns table(friendship_id uuid, created_at timestamp with time zone, id uuid, zzup_id text,
              profile_visibility text, real_name text, avatar_url text, university text,
              pet_name text, pet_avatar_url text, edu_verified boolean,
              pet_breed text, pet_stage text)
language sql security definer set search_path to 'public'
as $function$
  select f.id, f.created_at, p.id, p.zzup_id, p.profile_visibility,
    case when p.profile_visibility='pet_only'  then null else p.real_name end,
    case when p.profile_visibility='pet_only'  then null else p.avatar_url end,
    case when p.profile_visibility='pet_only'  then null else p.university end,
    case when p.profile_visibility='real_only' then null else p.pet_name end,
    case when p.profile_visibility='real_only' then null else p.pet_avatar_url end,
    p.edu_verified,
    case when p.profile_visibility='real_only' then null else p.pet_breed end,
    case when p.profile_visibility='real_only' then null else p.pet_stage end
  from public.friendships f
  join public.profiles p on p.id = f.requester_id
  where f.status='pending' and f.addressee_id = auth.uid() and p.deleted_at is null;
$function$;
grant execute on function public.list_pending_requests() to authenticated;

drop function if exists public.list_sent_requests();
create function public.list_sent_requests()
returns table(friendship_id uuid, created_at timestamp with time zone, id uuid, zzup_id text,
              profile_visibility text, real_name text, avatar_url text, university text,
              pet_name text, pet_avatar_url text, edu_verified boolean,
              pet_breed text, pet_stage text)
language sql security definer set search_path to 'public'
as $function$
  select f.id, f.created_at, p.id, p.zzup_id, p.profile_visibility,
    case when p.profile_visibility='pet_only'  then null else p.real_name end,
    case when p.profile_visibility='pet_only'  then null else p.avatar_url end,
    case when p.profile_visibility='pet_only'  then null else p.university end,
    case when p.profile_visibility='real_only' then null else p.pet_name end,
    case when p.profile_visibility='real_only' then null else p.pet_avatar_url end,
    p.edu_verified,
    case when p.profile_visibility='real_only' then null else p.pet_breed end,
    case when p.profile_visibility='real_only' then null else p.pet_stage end
  from public.friendships f
  join public.profiles p on p.id = f.addressee_id
  where f.status='pending' and f.requester_id = auth.uid() and p.deleted_at is null;
$function$;
grant execute on function public.list_sent_requests() to authenticated;

drop function if exists public.search_users(text);
create function public.search_users(p_keyword text)
returns table(id uuid, zzup_id text, profile_visibility text, real_name text,
              avatar_url text, university text, pet_name text, pet_avatar_url text,
              edu_verified boolean, pet_breed text, pet_stage text)
language sql security definer set search_path to 'public'
as $function$
  select p.id, p.zzup_id, p.profile_visibility,
    case when p.profile_visibility = 'pet_only'  then null else p.real_name end,
    case when p.profile_visibility = 'pet_only'  then null else p.avatar_url end,
    case when p.profile_visibility = 'pet_only'  then null else p.university end,
    case when p.profile_visibility = 'real_only' then null else p.pet_name end,
    case when p.profile_visibility = 'real_only' then null else p.pet_avatar_url end,
    p.edu_verified,
    case when p.profile_visibility = 'real_only' then null else p.pet_breed end,
    case when p.profile_visibility = 'real_only' then null else p.pet_stage end
  from public.profiles p
  where p.deleted_at is null and p.id <> auth.uid()
    and char_length(coalesce(p_keyword, '')) >= 1
    and (p.zzup_id = p_keyword
      or (p.searchable_by_real_name and p.real_name ilike '%' || p_keyword || '%'))
    and not exists (
      select 1 from public.blocked_users b
      where b.blocked_identity_type = 'real'
        and ((b.blocker_id = auth.uid() and b.blocked_id = p.id)
          or (b.blocker_id = p.id and b.blocked_id = auth.uid())))
  limit 20;
$function$;
grant execute on function public.search_users(text) to authenticated;

notify pgrst, 'reload schema';
