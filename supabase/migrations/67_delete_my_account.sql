-- =============================================================================
-- 67_delete_my_account.sql
-- 删除账号（App Store 5.1.1(v) / Google Play User Data 政策的硬性要求）
--
-- 背景：客户端 lib/api/auth.ts 一直在调 `delete_my_account`，但这个函数从未存在，
-- 按下「Delete account」只会弹 “Could not find the function public.delete_my_account”。
-- 按钮是摆设，账号一个字节都没动过。两家应用商店都会因此拒审。
--
-- -----------------------------------------------------------------------------
-- 为什么是软删除，不是 DROP ROW
-- -----------------------------------------------------------------------------
-- `messages.sender_id -> profiles.id` 是 **ON DELETE SET NULL**，
-- `profiles.id -> auth.users.id` 是 **ON DELETE CASCADE**。
-- 所以只要删掉 auth 用户，就会级联删掉 profile，进而把这个人**所有历史消息的
-- sender_id 清成 NULL** —— 谁发过什么永远无法追溯。
--
-- 对一个面向大学生、承载用户生成内容的产品，这等于给「发完违规内容就删号跑路」
-- 开了一条完美的销毁证据通道。美国 18 U.S.C. § 2258A（经 2024 REPORT Act 修订）
-- 要求服务提供者对涉童性剥削内容上报 NCMEC 并**保存至少一年**，用户删号不能免除。
-- GDPR 第 17(3)(b)(e) 条同样为「法律义务」和「法律主张的建立/行使/抗辩」留了例外。
--
-- 因此本函数采取分层策略：
--   第 1 层 立即抹除：可识别个人的信息（真名/头像/邮箱/生日/学校/宠物资料/兴趣向量）
--   第 2 层 保留脱钩：messages 全部保留，但发送者显示为 “Deleted user”。
--                     聊天记录是**双方**的数据，对方有权保留自己收到的对话。
--   第 3 层 保留证据：别人拉黑我的记录保留（防封禁规避）；
--                     举报/审核表尚未建，见 docs/ACCOUNT_DELETION.md 待办。
--
-- Google 明确要求：因安全/反欺诈/法规遵从而保留的数据，**必须在隐私政策里说明**。
-- 上线前务必让律师过一遍保留清单。
--
-- 回滚：db-backups/2026-08-14/ROLLBACK_67.sql
-- =============================================================================

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

  -- 幂等：重复调用直接返回，不报错（网络重试、双击都可能触发第二次）
  select deleted_at into v_already from public.profiles where id = v_uid;
  if v_already is not null then return; end if;

  -- ── 群主移交：我建的群要先交出去，否则群没人管 ──────────────────────────
  -- 逻辑与 leave_group 一致：交给最早加入的其他成员，并同步把 role 升为 admin。
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

  -- ── 退出所有群聊 ────────────────────────────────────────────────────────
  -- 私聊 / zZuPer Talk / 漂流瓶的成员身份**保留**：删掉的话对方的会话列表会
  -- 解析不出 peer，整个窗口消失（对方的聊天记录不该因为我删号而蒸发）。
  delete from public.conversation_members cm
  using public.conversations c
  where cm.conversation_id = c.id
    and cm.account_id = v_uid
    and c.kind = 'group';

  -- ── 关系数据：好友关系双向删除；我拉黑别人的记录也删 ────────────────────
  delete from public.friendships
  where requester_id = v_uid or addressee_id = v_uid;

  delete from public.blocked_users where blocker_id = v_uid;
  -- 注意：**别人拉黑我**的记录（blocked_id = v_uid）故意保留 ——
  -- 否则删号重注册就能绕过对方的拉黑。

  -- ── 第 1 层：抹除个人识别信息，打上删除标记 ─────────────────────────────
  update public.profiles set
    deleted_at              = now(),
    -- 展示名保留占位符而不是 NULL：会话列表/群成员列表直接显示
    -- “Deleted user”，不需要每个读取 RPC 再加一层 coalesce。
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
    -- 不可再被搜索 / 添加 / 打扰
    searchable_by_real_name = false,
    allow_add_via_search    = false,
    allow_add_via_qr        = false,
    allow_add_via_profile   = false,
    notify_driftbottle      = false,
    notify_petchat          = false,
    notify_friend           = false,
    notify_dm               = false,
    notify_group            = false
  where id = v_uid;

  -- 保留但未清理的（有意为之，见文件头）：
  --   messages            —— 全部保留，第 2 层
  --   zzup_id             —— 保留，用于封禁规避识别；本身不是个人信息
  --   pet_chat_messages   —— Ethan 的短期记忆表，删除策略待他确认
  --                          （同样内容在 messages 里也有一份，不影响证据保全）
end;
$function$;

grant execute on function public.delete_my_account() to authenticated;

notify pgrst, 'reload schema';
