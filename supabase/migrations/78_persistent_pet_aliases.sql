-- =============================================================================
-- 78_persistent_pet_aliases.sql
-- 会话内代号改为**持久化分配**，不再按成员集合实时计算
--
-- 迁移 73/77 里的 pet_alias 是这么算的：
--   把当前 conversation_members 按 md5 哈希排序，取 row_number 映射成字母。
--
-- 两个致命问题（实测发现）：
--
--   1. **有人加群/退群，所有人的代号都会变。** 排名依赖成员集合，集合一变，
--      名次全乱。今天的「A Dog」明天可能是「B Dog」—— 举报时说
--      「我举报 A Dog」就失去了指代能力，历史记录也会前后矛盾。
--
--   2. **退群的人留下的消息拿不到代号。** 他已不在 conversation_members 里，
--      查不到排名，返回 null，界面上退化成 "User"。
--      （实测：群 gfg 里 3b307c 退群后，他的宠物消息就是这样。）
--
-- 改法：代号是**分配一次、永不改变的事实**，存进独立表。
--
-- 分配时机：第一次以宠物身份发言时（触发器）。分配顺序 = 首次发言顺序 ——
-- 这不泄露任何东西，因为谁先开口读者本来就看得见。
-- （反过来说，按 joined_at 排就会泄露：成员列表本身就是按 joined_at 显示的。）
--
-- 回滚：db-backups/2026-08-15/ROLLBACK_78.sql
-- =============================================================================

create table if not exists public.conversation_aliases (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  account_id      uuid not null references public.profiles(id)      on delete cascade,
  alias           text not null,
  created_at      timestamptz not null default now(),
  primary key (conversation_id, account_id),
  unique (conversation_id, alias)
);

alter table public.conversation_aliases enable row level security;
-- 客户端一律不直读：代号只经由 list_messages / get_pet_identity 等 RPC 出现。
-- 直读会让人拿到 account_id ↔ alias 的对应关系，等于把马甲摘了。
revoke all on public.conversation_aliases from anon, authenticated;

-- ── 分配：取当前会话里下一个没用过的字母 ────────────────────────────────────
create or replace function public.ensure_pet_alias(
  p_conversation uuid,
  p_account      uuid
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_alias text; v_n int;
begin
  select alias into v_alias from public.conversation_aliases
  where conversation_id = p_conversation and account_id = p_account;
  if found then return v_alias; end if;

  select count(*) into v_n from public.conversation_aliases
  where conversation_id = p_conversation;

  v_alias := case
               when v_n < 26 then chr(65 + v_n)
               -- 27 人以上：A1 / B1 …（这么大的群本来也没什么匿名可言）
               else chr(65 + (v_n % 26)) || (v_n / 26)::text
             end;

  insert into public.conversation_aliases(conversation_id, account_id, alias)
  values (p_conversation, p_account, v_alias)
  on conflict (conversation_id, account_id) do nothing;

  -- 并发下 unique(conversation_id, alias) 可能撞车，重查一次拿到最终结果
  select alias into v_alias from public.conversation_aliases
  where conversation_id = p_conversation and account_id = p_account;

  return v_alias;
end;
$function$;

-- ── 查询：纯查表，不再计算 ──────────────────────────────────────────────────
create or replace function public.pet_alias(p_conversation uuid, p_account uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select alias from public.conversation_aliases
  where conversation_id = p_conversation and account_id = p_account;
$function$;

-- ── 反查（裸宠物页按代号寻址时用）───────────────────────────────────────────
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
  select account_id from public.conversation_aliases
  where conversation_id = p_conversation and alias = p_alias;
$function$;

-- ── 触发器：第一次以宠物身份发言时分配 ──────────────────────────────────────
-- 挂在 messages 上而不是发送 RPC 上，这样所有写入路径都覆盖到
-- （包括 Ethan 的 Edge Function 用 service_role 直接 insert 的那些）。
create or replace function public.trg_assign_pet_alias()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.identity_mode = 'pet' and new.sender_id is not null then
    perform public.ensure_pet_alias(new.conversation_id, new.sender_id);
  end if;
  return new;
end;
$function$;

drop trigger if exists on_pet_message_assign_alias on public.messages;
create trigger on_pet_message_assign_alias
  after insert on public.messages
  for each row execute function public.trg_assign_pet_alias();

-- ── 回填历史 ────────────────────────────────────────────────────────────────
-- 按每个会话里**首次宠物发言的时间**排序分配，与触发器今后的行为一致。
-- 包含已退群的人 —— 他们留下的消息同样需要一个稳定的指代。
do $$
declare r record;
begin
  for r in
    select conversation_id, sender_id, min(created_at) as first_at
    from public.messages
    where identity_mode = 'pet' and sender_id is not null
    group by conversation_id, sender_id
    order by conversation_id, min(created_at)
  loop
    perform public.ensure_pet_alias(r.conversation_id, r.sender_id);
  end loop;
end $$;
