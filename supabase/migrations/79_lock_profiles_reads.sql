-- =============================================================================
-- 79_lock_profiles_reads.sql
-- 锁死 profiles 的直读：全库 PII 不再对任意登录用户开放
--
-- ── 修的是什么 ──────────────────────────────────────────────────────────────
--
-- 改动前的状态：
--   RLS 策略：  SELECT USING (auth.uid() IS NOT NULL)     ← 只要登录就能读任何人
--   列级授权：  authenticated 持有全部 35 列的 SELECT     ← 包括下面这些
--
--     date_of_birth · personal_email · edu_email · interest_embedding
--
-- 也就是说，任何人注册一个账号，一行代码拖走全库用户的真名、生日、
-- 私人邮箱、学校邮箱：
--
--     await supabase.from('profiles').select('*')
--
-- 这跟宠物马甲强弱无关，是纯粹的 PII 泄露。而且 lib/api/auth.ts 的注释和
-- 隐私政策都写着「date_of_birth / personal_email 永不对外」。
--
-- ── 为什么必须整表撤销，不能只撤敏感列 ──────────────────────────────────────
--
-- 保留 pet_name 可直读的话，任何客户端都能拿匿名宠物的 sender_id 去查出真名，
-- 迁移 77/78 那套裸形态规则当场失效。所以「只走 RPC 读」不是洁癖，是前提。
--
-- ── 为什么这样做是安全的 ────────────────────────────────────────────────────
--
-- 已核对：读 profiles 的 17 个 public 函数**全部是 SECURITY DEFINER**，
-- 以函数属主身份执行，不受 authenticated 授权影响。其中包括 Ethan 的
-- try_match_user 和 match_travel_posts。
--
-- 三个 Edge Function（pet-chat / agent-chat / travel-mode）**只用 supabaseAdmin**
-- （service_role），绕过 RLS 和列级授权，而 service_role 的 35 条授权本迁移不动。
--
-- ⚠️ 前置条件（已完成）：lib/api/messages.ts 的 getMessages 原本用 PostgREST
--    内嵌联查读 profiles，依赖列级授权。迁移 77 已把它改成走 list_messages RPC。
--    如果回滚了 77 而没回滚本迁移，聊天记录会全空。
--
-- 保留 UPDATE 授权：updateProfile 要写自己那一行（RLS 限定 auth.uid() = id）。
--
-- 回滚：db-backups/2026-08-15/ROLLBACK_79.sql
-- =============================================================================

-- ── 1. 撤销所有列的 SELECT ──────────────────────────────────────────────────
revoke select on public.profiles from authenticated, anon;

-- 逐列撤销（列级授权是独立记录，表级 revoke 不一定清得干净）
do $$
declare c record;
begin
  for c in
    select column_name from information_schema.columns
    where table_schema='public' and table_name='profiles'
  loop
    execute format('revoke select (%I) on public.profiles from authenticated', c.column_name);
    execute format('revoke select (%I) on public.profiles from anon', c.column_name);
  end loop;
end $$;

-- ── 2. RLS 策略收紧成只能看自己 ─────────────────────────────────────────────
-- 授权撤了之后策略其实已经够不着了，但两道锁比一道好：
-- 万一以后有人手滑 grant 回去，策略仍然拦得住。
drop policy if exists "Profiles rows are visible to logged in users" on public.profiles;
create policy "own profile row only" on public.profiles
  for select using (auth.uid() = id);

notify pgrst, 'reload schema';
