-- =============================================================================
-- ROLLBACK_78.sql — 撤销 78_persistent_pet_aliases.sql
--
-- ⚠️ 破坏性：会 drop 掉 conversation_aliases 表，**所有已分配的代号全部丢失**。
--
--    回滚之后 pet_alias 退回「按当前成员集合实时计算」，于是：
--      · 有人加群/退群，所有人的代号都会变
--      · 已退群成员留下的宠物消息拿不到代号，界面退化成 "User"
--    这正是迁移 78 要解决的问题 —— 回滚等于把这两个 bug 放回去。
--
--    真要回滚的话，先把代号导出留档：
--      select * from public.conversation_aliases;
-- =============================================================================

drop trigger if exists on_pet_message_assign_alias on public.messages;
drop function if exists public.trg_assign_pet_alias();
drop function if exists public.ensure_pet_alias(uuid, uuid);

-- ── 恢复迁移 73/77 版本的实时计算实现 ───────────────────────────────────────
create or replace function public.pet_alias(p_conversation uuid, p_account uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ranked as (
    select cm.account_id,
           row_number() over (
             order by md5(p_conversation::text || cm.account_id::text)
           ) as n
    from public.conversation_members cm
    where cm.conversation_id = p_conversation
  )
  select case
           when n <= 26 then chr(64 + n::int)
           else chr(64 + (((n - 1) % 26) + 1)::int) || ((n - 1) / 26)::text
         end
  from ranked
  where account_id = p_account;
$function$;

create or replace function public.account_by_pet_alias(
  p_conversation uuid,
  p_alias        text
)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ranked as (
    select cm.account_id,
           row_number() over (
             order by md5(p_conversation::text || cm.account_id::text)
           ) as n
    from public.conversation_members cm
    where cm.conversation_id = p_conversation
  )
  select account_id from ranked
  where case
          when n <= 26 then chr(64 + n::int)
          else chr(64 + (((n - 1) % 26) + 1)::int) || ((n - 1) / 26)::text
        end = p_alias;
$function$;

drop table if exists public.conversation_aliases;

notify pgrst, 'reload schema';
