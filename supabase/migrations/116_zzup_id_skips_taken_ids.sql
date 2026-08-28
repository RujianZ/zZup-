-- =============================================================================
-- 116_zzup_id_skips_taken_ids.sql
--
-- zzup_id 改成「取下一个序列值，撞到已占用的就继续往下取」。
--
-- ── 为什么需要 ───────────────────────────────────────────────────────
-- 原来的 default 是裸 nextval + UNIQUE 约束，**没有任何跳号逻辑**：
--     zzup_id DEFAULT lpad(nextval('zzup_id_seq')::text, 5, '0')
--     UNIQUE (zzup_id)
--
-- 2026-08-28 清完测试号（只留 Joe / Claude / Play Reviewer / Ethan 四个）之后，
-- 把序列重置到 0 以回收那些空出来的号。如果不加跳号：
--     第 1 个新用户 → 00001  ✅
--     第 2 个新用户 → 00002  ❌ 唯一约束冲突 → **注册直接失败**
-- Joe 的号就在 00002 上。
--
-- ── ⚠️ 必须 SECURITY DEFINER ─────────────────────────────────────────
-- profiles 开着 RLS，SELECT 策略是「只能看自己那一行」。普通权限下
-- 那句 exists 永远返回 false → 跳号静默失效，而且**不报错**，
-- 一直到第二个新用户注册失败才会发现。
-- 表属主是 postgres 且没开 FORCE ROW LEVEL SECURITY，所以 definer 身份看得到全表。
--
-- ── 语义上的副作用，正好是想要的 ─────────────────────────────────────
-- 用户自助删号走的是 `delete_my_account()`，那是**软删** —— profile 行留着、
-- 打 deleted_at 标记。所以那个 zzup_id **一直被占着，永远不会被回收**。
-- 只有像这次这样整行硬删的测试号才腾得出号来。
--
-- 也就是：**这一次回收，以后用户删号不回收。**
--
-- ── 一次性操作（不在本文件里，新库不需要）────────────────────────────
--     select setval('public.zzup_id_seq', 1, false);
-- 新建的库序列本来就从 1 开始，所以这句只对现有生产库执行过一次。
--
-- 干跑验证（2026-08-28，现存 00002/00006/00015/00018）：
--     00001 → 00003 → 00004 → 00005 → 00007 → 00008 → 00009 → 00010
--              ↑ 跳过 00002              ↑ 跳过 00006
-- =============================================================================

create or replace function public.next_zzup_id()
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id text;
begin
  loop
    v_id := lpad(nextval('public.zzup_id_seq')::text, 5, '0');
    exit when not exists (select 1 from public.profiles where zzup_id = v_id);
  end loop;
  return v_id;
end;
$$;

alter table public.profiles alter column zzup_id set default public.next_zzup_id();
