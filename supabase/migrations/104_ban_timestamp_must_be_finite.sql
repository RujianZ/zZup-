-- 104 · 封禁时间戳不能用 'infinity'
--
-- 迁移 103 用了 banned_until = 'infinity'::timestamptz。数据库这侧完全合法，
-- 但 GoTrue 是 Go 写的，它把这一列扫进 Go 的时间类型时认不出 Postgres 的
-- infinity，整个查询直接 500。
--
-- 表现：登录**确实被拦住了**，但报的是 "Database error querying schema"。
-- 也就是说它是靠让查询崩掉来「生效」的 —— 这既不可靠（换一条代码路径行为
-- 可能完全不同），文案也没法看。
--
-- 换成有限的远期时间戳。模拟器实测：同一个账号改完之后 GoTrue 正常返回封禁
-- 错误，客户端把它翻成「This account was deleted and can't be used to sign in.」
--
-- 函数正文与 103 完全一致，只有 banned_until 那一行不同 —— 全文重写是因为
-- create or replace 要求给出完整定义。

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

  -- 1. 封掉登录。用有限的远期时间戳，**不要 'infinity'** ——
  --    GoTrue 扫不出 Postgres 的 infinity，整个登录查询会 500。
  update auth.users
  set banned_until = '9999-12-31 23:59:59+00'::timestamptz
  where id = v_uid;

  -- 2. 掐掉已经发出去的会话。不掐的话手上那张刷新令牌还能继续换新令牌，
  --    封禁要等到令牌自然过期才真正生效。
  delete from auth.sessions where user_id = v_uid;
end;
$function$;

-- 把 103 已经写成 infinity 的行改回来
update auth.users
set banned_until = '9999-12-31 23:59:59+00'::timestamptz
where banned_until = 'infinity'::timestamptz;
