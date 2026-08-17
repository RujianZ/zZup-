-- 97_drop_dead_offer_feature_and_buckets.sql
--
-- 2026-08-18 冗余排查的结果（docs/_local/冗余与垃圾排查_2026-08-18.md）。
-- 删之前逐项确认过：全部 0 行 / 0 对象 / 0 外键依赖 / 0 代码引用。
--
-- 1. `offer_verifications` 表 —— 一整个死功能的残骸：
--    0 行、0 个数据库函数引用、0 处客户端引用，配套的 offer-screenshots 桶也是空的。
--
-- 2. 三个零引用的桶的**存储策略**：
--    avatars            public=true，0 对象 —— 用户根本不上传头像，只能从预设里选
--    post-images        public=true，0 对象 —— Roam 图片走的是迁移 96 新建的 roam-media
--    offer-screenshots  0 对象 —— 配套上面那张表
--
-- ⚠️⚠️ 桶本身这份迁移删不掉 ⚠️⚠️
--    `delete from storage.buckets` 会被 Supabase 的 storage.protect_delete() 触发器拦下：
--      ERROR 42501: Direct deletion from storage tables is not allowed.
--                   Use the Storage API instead.
--    而 Storage API 删桶需要 service_role key。
--    **三个桶要在 Supabase 后台 Storage 页面手动删**（策略这份迁移已经清掉了，
--    所以就算漏删，那三个桶也已经没有任何可用的读写策略）。
--
-- ⚠️ 特别说明：`blocked_users` 表虽然也是 0 行，**不能删** ——
--    它被 8 个函数在用（block_identity / create_dm / delete_my_account /
--    search_users / send_friend_request / get_friendship_status /
--    list_blocked_identities / unblock_identity）。差点误判，查了
--    pg_get_functiondef 才看出来。
--
-- ⚠️ `my_university()` 孤儿函数本次**保留**（Joe 2026-08-18 决定）。
-- ⚠️ `lib/api/_xp.ts` 和 `add_xp()` **保留** —— 宠物经验系统以后要做。
-- ⚠️ `expo-camera` / `expo-notifications` **保留** —— 拍照已实现（走 ImagePicker），
--    通知以后要做。
--
-- 回滚：db-backups/2026-08-18/ROLLBACK_97.sql

-- ── 1. 死表 ──
drop table if exists public.offer_verifications;

-- ── 2. 三个死桶的存储策略 ──
drop policy if exists "avatars_authenticated_upload"      on storage.objects;
drop policy if exists "avatars_owner_delete"              on storage.objects;
drop policy if exists "avatars_owner_update"              on storage.objects;
drop policy if exists "avatars_public_read"               on storage.objects;
drop policy if exists "offer_screenshots_owner_read"      on storage.objects;
drop policy if exists "offer_screenshots_owner_upload"    on storage.objects;

-- ── 3. 桶本身：见上面的说明，必须在后台手动删 ──
--   Supabase Dashboard → Storage → 选中 avatars / post-images / offer-screenshots → Delete bucket
