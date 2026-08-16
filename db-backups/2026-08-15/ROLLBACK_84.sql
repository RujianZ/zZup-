-- =============================================================================
-- ROLLBACK_84.sql — 撤销 84_fix_conversations_policy_profiles_dep.sql
--
-- ⚠️ 除非同时回滚 79（撤销 profiles 读权限），否则**回滚这条会让 App 直接瘫**。
--
--    恢复后的策略表达式里有一句
--        university = (select profiles.university from profiles where id = auth.uid())
--
--    **RLS 策略表达式是以当前用户身份求值的**，不像 SECURITY DEFINER 函数那样
--    以属主身份运行。79 撤销 profiles 读权限之后，它跟客户端直查撞的是同一堵墙：
--    **任何**对 conversations 的查询都会报 `permission denied for table profiles`
--    —— Pulse 进不去聊天、Roam 回复留言失败、会话列表全空。
--
--    正确的回滚顺序是先 ROLLBACK_79 再 ROLLBACK_84。单独跑这条基本没有意义。
--
-- 前置：ROLLBACK_85 已执行。
-- =============================================================================

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
        or (group_type = 'edu_verified'
            and university = (select p.university from public.profiles p where p.id = auth.uid()))
      )
    )
  )
);

-- my_university() 留着不删：删了会连带打断别处（若有）对它的引用，
-- 而一个多余的 SECURITY DEFINER 只读函数没有任何害处。
-- 真要清干净：drop function if exists public.my_university();
