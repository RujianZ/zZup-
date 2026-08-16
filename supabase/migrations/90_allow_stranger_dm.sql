-- =============================================================================
-- 90_allow_stranger_dm.sql
-- 陌生人私信开关
--
-- ── 为什么会有这个迁移 ───────────────────────────────────────────────────────
-- 官网从 v0.1 起就在主打这个功能：
--   index.html  「The stranger switch — One toggle, and no stranger can ever
--                 open a chat with you. Your DMs, your rules.」
--   about.html  「One switch turns off all messages from strangers.」
-- 但它**从来没做过**。profiles 里没有这一列，create_dm 里没有这个判断，
-- 全仓库 grep -i stranger 零命中。2026-08-16 对着代码逐条核对官网时发现的 ——
-- 营销页上承诺了一个不存在的隐私功能。这不是补功能，是补一个已经说出去的话。
--
-- 有意思的是 privacy.html 反而是准确的：它列设置项时老老实实只写了
-- searchable_by_real_name / allow_add_via_* / 五个 notify_*，没跟着吹。
--
-- ── 判定点为什么只在 create_dm ───────────────────────────────────────────────
-- 全库 insert into public.conversations 只有 6 处，逐个看过：
--   27:190  zzuper_talk  自己和自己的宠物聊，不存在陌生人
--   27:225  dm           ★ 本次判定点：陌生人**单方面**开一个窗口
--   27:257  group        create_group 已强制所有成员必须是好友
--   53:25   zzuper_talk  注册时自动建的，同第一条
--   60:72   petchat      Pulse 匹配 —— **双方都主动进了队列**才可能配上。
--                        不想被陌生人配到，不进队列即可，不需要这个开关
--   61:52   driftbottle  Roam —— 只有**帖子作者**能回复评论者，而评论者是
--                        主动跑来评论的。同样是双向动作，不是冷启动骚扰
-- 所以「陌生人单方面开一个聊天窗口」这条路，全库只有 create_dm 一条。
-- 判定放在 SECURITY DEFINER 函数里，改客户端绕不过去。
--
-- ── 语义：管开窗，不管已开的窗 ───────────────────────────────────────────────
-- 判定**放在「复用已有会话」之后**。也就是说：
--   · 关掉之后，非好友无法与你**新建**私聊
--   · 之前已经存在的私聊照常打开、照常收发
-- 官网原话是 "no stranger can ever **open** a chat with you"，open = 开新窗口。
-- 把已有对话一起冻掉是另一件事（那是拉黑），不该由一个设置开关顺手做掉。
--
-- 四种身份组合（真人↔真人 / 真人↔宠物 / 宠物↔真人 / 宠物↔宠物）一视同仁 ——
-- 顶着宠物马甲来敲门，也还是陌生人敲门。
--
-- ── 默认 true ────────────────────────────────────────────────────────────────
-- 默认放开。zZuP! 整个产品就是让陌生人互相认识，默认关掉等于默认把产品关掉。
-- 官网的表述也是「一个开关」——即用户主动去关，不是默认关。
--
-- ── 故意不加进 get_other_profile ─────────────────────────────────────────────
-- 谁开了谁没开是**可探测信息**。如果客户端能读到，就能拿它反推别人的设置，
-- 甚至批量扫。所以这一列只在 get_my_profile 里返回（读自己），
-- 别人的一律读不到 —— 客户端只能真的去调 create_dm，由服务端拒。
-- 代价是对方要点了「发消息」才知道发不出去，这个代价值得付。
--
-- ── 报错信息为什么和拉黑分开 ─────────────────────────────────────────────────
-- 拉黑抛的是 'Cannot start conversation'。这里抛一句不同的话，
-- 反而让「收到通用报错 = 我被拉黑了」这个推断变得**不确定** —— 多一种原因，
-- 探测性就低一分。
--
-- 回滚：db-backups/2026-08-16/ROLLBACK_90.sql
-- =============================================================================

-- ── 列 ───────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists allow_stranger_dm boolean not null default true;

comment on column public.profiles.allow_stranger_dm is
  '为 false 时，非好友无法新建与本人的私聊（create_dm）。已存在的会话不受影响。'
  '判定在 create_dm 内部，客户端绕不过。故意不对 get_other_profile 开放。';

-- 迁移 25 的 grant update 是**显式列清单**，新列不会自动继承 ——
-- 不补这一句，客户端保存时就是 42501 permission denied。
grant update (allow_stranger_dm) on public.profiles to authenticated;

-- 刻意**不**加进 grant select：读自己走 get_my_profile（下面），读别人一律不给。

-- ── get_my_profile：补返回新列 ───────────────────────────────────────────────
-- 这个函数用的是显式 json_build_object，加了列不改它就等于没加 ——
-- 迁移 70 已经因为 pet_breed 踩过一模一样的坑。
--
-- ⚠️ 基线必须取**迁移 74**，不是 70。写这条迁移时我第一版照着 70 抄，
--    把 74 已经 drop 掉的 profile_visibility 又写了回去 → 每次调用 42703，
--    所有人卡在启动页「Can't reach zZuP! — retrying…」。
--    教训：create or replace 一个老函数之前，先 pg_get_functiondef 拉线上原文，
--    别照最早那次改动的迁移文件抄 —— 中间可能还有别的迁移动过它。
-- 下面的函数体 = 迁移 74 版本原样 + 一行新字段。
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
    -- profile_visibility 在迁移 74 已删列，这里不能有它
    'searchable_by_real_name', p.searchable_by_real_name,
    'allow_add_via_search', p.allow_add_via_search,
    'allow_add_via_qr', p.allow_add_via_qr,
    'allow_add_via_profile', p.allow_add_via_profile,
    'allow_stranger_dm', p.allow_stranger_dm,      -- ← 迁移 90 补上
    'notify_driftbottle', p.notify_driftbottle, 'notify_petchat', p.notify_petchat,
    'notify_friend', p.notify_friend, 'notify_dm', p.notify_dm, 'notify_group', p.notify_group,
    'onboarded', p.onboarded, 'deleted_at', p.deleted_at, 'created_at', p.created_at
  );
end;
$function$;

grant execute on function public.get_my_profile() to authenticated;

-- ── create_dm：加陌生人判定 ──────────────────────────────────────────────────
-- 函数体是线上现行版本（= 迁移 27）原样，只插入一段判定。
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

  -- 身份级拉黑(双向)
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

  -- ── 迁移 90：陌生人私信开关 ────────────────────────────────────────────────
  -- 位置很重要：在「复用已有会话」之后、「建新会话」之前。
  -- 这样已经开着的窗口不受影响，只拦新开的。
  --
  -- 好友判定用 least/greatest 归一化，和 create_group 里的写法保持一致 ——
  -- friendships 不保证谁是 requester。
  if not coalesce(
       (select allow_stranger_dm from public.profiles where id = p_target_id),
       true)                                     -- 查不到就放行，不因为脏数据把人锁死
     and not exists (
       select 1 from public.friendships
       where status = 'accepted'
         and least(requester_id, addressee_id)    = least(v_uid, p_target_id)
         and greatest(requester_id, addressee_id) = greatest(v_uid, p_target_id))
  then
    raise exception 'This person only accepts messages from people they have added.'
      using errcode = '42501';
  end if;

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

grant execute on function public.create_dm(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
