-- =============================================================================
-- 53_handle_new_user.sql  (v3 重构)
--
-- 新用户注册(auth.users 插入)时自动:
--   1. 建 profile 行
--   2. 建固定宠物会话 zZuPer Talk(kind='zzuper_talk'),落实"注册完就有"
--
-- 说明:
--   - SECURITY DEFINER 绕过 profiles / conversations 的列级 INSERT 限制。
--   - 这里直接用 new.id 建会话(不走 get_or_create_zzuper_talk,
--     因为触发器上下文里 auth.uid() 为空)。get_or_create_zzuper_talk
--     仍作为幂等兜底保留在 27。
--   - 任一步失败都会回滚 auth.users 插入(不留孤儿数据)。
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_conv_id uuid;
begin
  -- 1. 建 profile
  insert into public.profiles (id, personal_email)
  values (new.id, new.email);

  -- 2. 建固定宠物会话(zZuPer Talk)
  insert into public.conversations (kind, created_by)
  values ('zzuper_talk', new.id)
  returning id into v_conv_id;

  insert into public.conversation_members (conversation_id, account_id, member_identity, role)
  values (v_conv_id, new.id, 'real', 'admin');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
