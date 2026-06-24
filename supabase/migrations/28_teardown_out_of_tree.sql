-- =============================================================================
-- 28_teardown_out_of_tree.sql  (v3 重构 · 显式拆除树外系统)
--
-- A 决策:树外系统整体移除。审计发现它们在云端并未被 25 的 cascade 删掉,
--   故此处显式 DROP。CASCADE 会一并清掉其 policies / grants / triggers /
--   Realtime 订阅。offer_verifications 保留(随 29 待定)。
-- =============================================================================

-- 社交动态
drop table if exists public.post_viewers cascade;
drop table if exists public.likes cascade;
drop table if exists public.comments cascade;
drop table if exists public.posts cascade;

-- 地理探索 / 排行
drop table if exists public.explored_tiles cascade;
drop table if exists public.explored_paths cascade;
drop table if exists public.explorations cascade;
drop table if exists public.landmark_cache_zones cascade;
drop table if exists public.landmarks cascade;
drop table if exists public.user_locations cascade;

-- 相关函数
drop function if exists public.is_post_viewer(uuid);
drop function if exists public.update_likes_count() cascade;
drop function if exists public.update_comments_count() cascade;
drop function if exists public.discover_landmark(uuid, double precision, double precision, integer);
drop function if exists public.set_active_title(text);
drop function if exists public.get_weekly_rankings(text);
drop function if exists public.compute_explored_path_bbox() cascade;
