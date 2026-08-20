-- 103 · 删过号的人不能再登录
--
-- 问题：`delete_my_account()` 是软删 —— 打 `deleted_at`、改名 'Deleted user'、
-- 清空 PII，但 **auth.users 那一行原样留着**，而且没有任何地方拦登录。
-- 于是删完号的人用原来的邮箱密码还能登进来，`RootNavigator` 判的是
-- `!profile?.real_name`，而 real_name 被设成了字符串 'Deleted user' 而不是 null，
-- 引导页拦不住，直接落到主界面，身份就叫「Deleted user」。
--
-- 苹果 5.1.1(v) 和 Google 的账号删除要求都是「删了就是删了」。
--
-- 为什么不干脆删 auth.users：`profiles.id` 是 ON DELETE CASCADE，删了会连带
-- 清空这个人的全部数据。而已定的口径是**删号不清任何内容**（对别人是「已删除
-- 用户」，对我们数据全在，举报快照和保存义务都靠它）。所以留数据、封登录。
--
-- 封的手段是 GoTrue 自带的 `banned_until`：被封的账号 signInWithPassword 直接
-- 被拒，拒绝发生在**发令牌之前**，改客户端绕不过去。
--
-- ⚠️ 副作用：原邮箱从此不能重新注册（auth.users 里那行还占着 email 唯一约束）。
--    这是「留数据」这个口径的必然结果。要不要允许同邮箱回归，是产品决定，
--    见文档待办，不在这条迁移里替它决定。

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_already timestamptz;
  v_conv record;
  v_next uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select deleted_at into v_already from public.profiles where id = v_uid;
  if v_already is not null then return; end if;

  -- 自己建的群先交出群主，别把群一起带走
  for v_conv in
    select c.id
    from public.conversations c
    join public.conversation_members cm on cm.conversation_id = c.id and cm.account_id = v_uid
    where c.kind = 'group' and c.created_by = v_uid
  loop
    select account_id into v_next
    from public.conversation_members
    where conversation_id = v_conv.id and account_id <> v_uid
    order by joined_at asc limit 1;

    if v_next is not null then
      update public.conversations set created_by = v_next where id = v_conv.id;
      update public.conversation_members set role = 'admin'
      where conversation_id = v_conv.id and account_id = v_next;
    end if;
  end loop;

  delete from public.conversation_members cm
  using public.conversations c
  where cm.conversation_id = c.id
    and cm.account_id = v_uid
    and c.kind = 'group';

  delete from public.friendships
  where requester_id = v_uid or addressee_id = v_uid;

  delete from public.blocked_users where blocker_id = v_uid;

  update public.profiles set
    deleted_at              = now(),
    real_name               = 'Deleted user',
    pet_name                = 'Deleted user',
    bio                     = null,
    pet_bio                 = null,
    avatar_url              = null,
    pet_avatar_url          = null,
    qr_code_url             = null,
    date_of_birth           = null,
    gender                  = null,
    nationality             = null,
    university              = null,
    personal_email          = null,
    personal_email_verified = false,
    edu_email               = null,
    edu_verified            = false,
    interest_embedding      = null,
    searchable_by_real_name = false,
    allow_add_via_search    = false,
    allow_add_via_qr        = false,
    allow_add_via_profile   = false,
    notify_driftbottle      = false,
    notify_petchat          = false,
    notify_friend           = false,
    notify_group            = false,
    notify_dm               = false
  where id = v_uid;

  -- ↓ 这一段是 103 新增的 ↓

  -- 1. 封掉登录。'infinity' 是永久 —— 删号没有到期一说。
  update auth.users
  set banned_until = 'infinity'::timestamptz
  where id = v_uid;

  -- 2. 掐掉已经发出去的会话。不掐的话手上那张刷新令牌还能继续换新令牌，
  --    封禁要等到令牌自然过期才真正生效。
  delete from auth.sessions where user_id = v_uid;
end;
$function$;

-- 补上历史遗留：如果有已经软删但没被封的号，一起封掉。
-- （写这条迁移时线上是 0 行，但这个函数在 103 之前跑过，不能假设一定是 0。）
update auth.users u
set banned_until = 'infinity'::timestamptz
from public.profiles p
where p.id = u.id
  and p.deleted_at is not null
  and (u.banned_until is null or u.banned_until < now());
