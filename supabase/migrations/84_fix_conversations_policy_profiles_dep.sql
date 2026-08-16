-- =============================================================================
-- 84_fix_conversations_policy_profiles_dep.sql
-- 修复 conversations 的 RLS 策略对 profiles 的直接依赖
--
-- ── 症状 ─────────────────────────────────────────────────────────────────────
-- 迁移 79 撤销 profiles 的读权限之后，**任何**对 conversations 的查询都报
-- `permission denied for table profiles`。表现为 Pulse 进不去聊天、
-- Roam 回复留言失败。
--
-- ── 根因 ─────────────────────────────────────────────────────────────────────
-- 策略表达式里有一句：
--     university = (select profiles.university from profiles where id = auth.uid())
--
-- **RLS 策略表达式是以当前用户身份求值的**，不像 SECURITY DEFINER 函数那样
-- 以属主身份运行。所以它跟客户端直查 profiles 撞的是同一堵墙。
--
-- 我之前扫的是应用代码里的 `from('profiles')` 和 PostgREST 内嵌联查，
-- **没想到策略内部也会读它** —— 这是这次锁库漏掉的第三类调用点
-- （前两类：内嵌联查、未读计数）。
--
-- ── 修法 ─────────────────────────────────────────────────────────────────────
-- 把「取当前用户的学校」抽成 SECURITY DEFINER 函数。策略调它即可，
-- 语义完全不变，只是求值身份从「调用者」变成「函数属主」。
--
-- 回滚：db-backups/2026-08-15/ROLLBACK_84.sql
-- =============================================================================

create or replace function public.my_university()
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select university from public.profiles where id = auth.uid();
$function$;

grant execute on function public.my_university() to authenticated;

drop policy if exists "view conversations" on public.conversations;
create policy "view conversations" on public.conversations
for select using (
  auth.uid() is not null
  and (
    exists (
      select 1 from public.conversation_members m
      where m.conversation_id = conversations.id
        and m.account_id = auth.uid()
    )
    or (
      kind = 'group'
      and is_searchable
      and members_count >= 3
      and (
        group_type = any (array['open','official'])
        -- 原来这里直接 select profiles.university，策略以调用者身份求值，
        -- profiles 读权限撤销后必然失败。改走 SECURITY DEFINER 函数。
        or (group_type = 'edu_verified' and university = public.my_university())
      )
    )
  )
);
