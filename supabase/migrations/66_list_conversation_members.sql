-- =============================================================================
-- 66_list_conversation_members.sql
-- 补上缺失的群成员读取 RPC
--
-- 背景：conversation_members 的 SELECT 策略是 `auth.uid() = account_id`
-- （Ethan 在修 RLS 无限递归时改的），也就是**你只看得见自己那一行**。
-- 当时的说明是「其他成员的身份由 SECURITY DEFINER RPC 提供」，
-- 但那个 RPC 一直没建。结果 lib/api/conversations.ts 里长出了一段兜底：
-- 查不到成员就拿 profiles 前 20 条冒充群成员 —— 界面看起来正常，
-- 实际显示的是与该群毫无关系的陌生人。
--
-- 这里补上真正的读取入口；客户端那段假数据同步删除。
--
-- 权限：调用者必须是该会话成员，否则返回空（不报错，避免探测会话是否存在）。
-- 展示名/头像按各成员在本会话中的 member_identity 取真人或宠物那一套；
-- pet_breed/pet_stage 供本地头像资产使用（见迁移 64 与 components/PetAvatar）。
--
-- 纯新增函数：不动表结构/数据/RLS，不碰 Edge Function。
-- 回滚：db-backups/2026-08-13/ROLLBACK_66.sql
-- =============================================================================

create or replace function public.list_conversation_members(p_conversation_id uuid)
returns table(
  account_id uuid,
  member_identity text,
  role text,
  joined_at timestamptz,
  display_name text,
  display_avatar text,
  pet_breed text,
  pet_stage text
)
language sql
security definer
set search_path to 'public'
as $function$
  select
    cm.account_id,
    cm.member_identity,
    cm.role,
    cm.joined_at,
    case when cm.member_identity = 'pet' then p.pet_name else p.real_name end,
    case when cm.member_identity = 'pet' then p.pet_avatar_url else p.avatar_url end,
    case when cm.member_identity = 'pet' then p.pet_breed else null end,
    case when cm.member_identity = 'pet' then p.pet_stage else null end
  from public.conversation_members cm
  join public.profiles p on p.id = cm.account_id
  where cm.conversation_id = p_conversation_id
    and p.deleted_at is null
    -- 仅本会话成员可读
    and exists (
      select 1 from public.conversation_members me
      where me.conversation_id = p_conversation_id
        and me.account_id = auth.uid()
    )
  order by (cm.role = 'admin') desc, cm.joined_at asc;
$function$;

grant execute on function public.list_conversation_members(uuid) to authenticated;

notify pgrst, 'reload schema';
