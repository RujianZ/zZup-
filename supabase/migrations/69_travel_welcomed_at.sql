-- =============================================================================
-- 69_travel_welcomed_at.sql
-- 给 travel_posts 补一个终态：welcomed_at
--
-- 背景（2026-08-14 实测）：zZuPer Roam 对老用户是**完全锁死**的。
--
--   status 的 CHECK 只允许 ('traveling','returned')，**没有任何值表示
--   「这趟旅行已经结束并且主人确认过了」**。于是：
--
--     welcomePetHome()  →  update status='returned'   ← 它本来就已经是 'returned'
--                                                        这个更新什么都没改
--     getActiveTravelPost()  →  .in('status', ['traveling','returned'])
--                               又把同一条查出来
--
--   FreeTravelScreen 点完「Welcome home」只是本地 setActivePost(null) 闪一下，
--   下次进页面又被同一条帖子拉回「宠物回家了」界面 —— 无限循环，没有出口。
--
--   后果：Joe 那条 2026-08-07 的帖子在「等待迎接」状态卡了 7 天，
--   期间**发不出任何新的漂流**。这也解释了为什么全库只有 1 条 travel_post、
--   travel_comments 和 travel_post_views 都是 0 —— 功能第一次用完就再没能用过。
--
-- 做法：加一个可空的时间戳作为终态标记。
--   · 纯增量：不改 status 的 CHECK、不动 RLS、不动 match_travel_posts
--     （后者只看 status='traveling'，与本列无关）
--   · 同时把历史遗留的「已 returned 但从未被迎接」的帖子一次性归档，
--     否则老用户仍然被卡住。
--
-- 回滚：db-backups/2026-08-14/ROLLBACK_69.sql
-- =============================================================================

alter table public.travel_posts
  add column if not exists welcomed_at timestamptz;

comment on column public.travel_posts.welcomed_at is
  '主人点「迎接回家」的时间。非空 = 这趟旅行已归档，不再占用「当前旅行」槽位。';

-- 查询「当前是否有旅行」时会带上 welcomed_at is null，加个索引
create index if not exists travel_posts_user_open_idx
  on public.travel_posts (user_id, started_at desc)
  where welcomed_at is null;

-- 历史数据归档：已经 returned 且结束时间已过的老帖，直接标记为已迎接，
-- 否则这些账号永远发不了新的漂流。
update public.travel_posts
set welcomed_at = now()
where welcomed_at is null
  and status = 'returned'
  and ends_at < now();
