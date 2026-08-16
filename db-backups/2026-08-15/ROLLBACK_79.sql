-- =============================================================================
-- ROLLBACK_79.sql — 撤销 79_lock_profiles_reads.sql
--
-- ⚠️ 执行这个脚本 = **把全库 PII 泄露漏洞放回去**。
--    恢复之后，任何登录用户一行 `select('*')` 就能拖走所有人的
--    真名 / 生日 / 私人邮箱 / 学校邮箱 / 匹配向量。
--
--    只有在客户端确实被打断、且当场修不了的时候才用。用完尽快改回去。
--
-- 权限正本（改动前的完整快照，35 条列授权）：
--   D:\zzup-supabase\backups\2026-08-15_pre-rls-lockdown\04_policies\grants_and_policies.sql
-- =============================================================================

-- ── 恢复 authenticated 的列级 SELECT（35 列）────────────────────────────────
do $$
declare c record;
begin
  for c in
    select column_name from information_schema.columns
    where table_schema='public' and table_name='profiles'
  loop
    execute format('grant select (%I) on public.profiles to authenticated', c.column_name);
  end loop;
end $$;

-- ── 恢复原来的 RLS 策略（任何登录用户可读任何人）────────────────────────────
drop policy if exists "own profile row only" on public.profiles;
create policy "Profiles rows are visible to logged in users" on public.profiles
  for select using (auth.uid() is not null);

notify pgrst, 'reload schema';
