-- =============================================================================
-- 93_ai_disclosure_timestamp.sql
-- zZuPer Talk 的 AI 披露时间戳（纽约 GBL §1700）
--
-- ── 为什么要这一列 ───────────────────────────────────────────────────────────
-- 纽约 GBL §1700（2025-11-05 已生效）要求 companion chatbot：
--   · 会话**开始时**告知「你不是在和人类对话」
--   · **持续会话至少每 3 小时**再提示一次
-- 罚则：总检察长执法，每日最高 $15,000，另有私人诉权。
--
-- 加州 SB 243 的「每 3 小时提醒休息」是**针对未成年人**的，我们 18+
-- （迁移 75 服务端强制），那条不适用。这里做的只有纽约这一条。
--
-- ── 判定锚在「距上次披露」，不是「距上一条消息」 ─────────────────────────────
-- 曾经考虑过按消息间隔判定，是错的：
--   一个学生从晚 9 点连着聊到凌晨 1 点，任何两条消息之间都不超过 3 小时
--   → 一次都不会触发。而这恰恰是法条最想覆盖的场景（聊太久忘了对面是程序）。
--
-- 所以只有一条规则：
--     now - last_ai_disclosure_at > 3 小时  →  展示，并把时间戳推到 now
--
-- 这一条同时覆盖三种情况，不需要去定义什么叫「持续会话」：
--   · 第一次进来（列为 null）        → 触发 = 法条要的「会话开始时」
--   · 隔天再回来（20 小时前）        → 触发 = 又一次「会话开始」
--   · 连续聊 4 小时（3 小时前）      → 触发 = 「持续会话每 3 小时」
--   · 连续聊 1 小时（40 分钟前）     → 不触发，不打扰
--
-- ── 为什么记服务端而不是客户端本地 ───────────────────────────────────────────
-- 纯客户端状态出事时举不了证。落库之后「我们在 X 时刻告知过这个用户」
-- 是一条可查的记录 —— 这正是有私人诉权的法条下最需要的东西。
--
-- ── 为什么挂在 conversation_members 而不是 conversations ─────────────────────
-- 披露是**对某个人**做的，不是对某个会话做的。zZuPer Talk 只有一个成员，
-- 两种挂法此刻没差别；但 Pulse 是两个人，将来要在那边也做的话，
-- 挂会话上就得推倒重来。
--
-- ── ⚠️ 披露内容绝对不能写进 messages 表 ──────────────────────────────────────
-- pet-chat 会把最近几条消息当上下文喂给模型。披露句一旦是一条真实消息，
-- 模型就会在对话历史里读到「你在和 AI 对话」，然后顺着它聊自己是不是 AI ——
-- 等于我们亲手造了一个随机破坏人设的装置。
-- 所以：**服务端只存时间戳，那句话由客户端渲染成分隔线，不落消息表。**
--
-- 回滚：db-backups/2026-08-16/ROLLBACK_93.sql
-- =============================================================================

alter table public.conversation_members
  add column if not exists last_ai_disclosure_at timestamptz;

comment on column public.conversation_members.last_ai_disclosure_at is
  '最后一次向这个成员展示 AI 披露的时间（纽约 GBL §1700：会话开始 + 持续会话每 3 小时）。'
  '只由 touch_ai_disclosure() 读写；披露内容不入 messages 表，避免进入模型上下文。';

-- ── 判定 + 打戳，一次调用完成 ────────────────────────────────────────────────
-- 返回 true = 该展示了（并且时间戳已经推到 now）。
-- 判定和写入放在同一条语句里，避免「查完还没写」之间被重复调用而连弹两次。
create or replace function public.touch_ai_disclosure(p_conversation uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid  uuid := auth.uid();
  v_due  boolean;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;

  update public.conversation_members
     set last_ai_disclosure_at = now()
   where conversation_id = p_conversation
     and account_id = v_uid
     and (last_ai_disclosure_at is null
          or last_ai_disclosure_at < now() - interval '3 hours')
  returning true into v_due;

  -- 没有命中：要么不到 3 小时（不该展示），要么这人根本不是这个会话的成员。
  -- 两种都返回 false —— 不是成员的话本来也不该给他渲染任何东西。
  return coalesce(v_due, false);
end;
$function$;

grant execute on function public.touch_ai_disclosure(uuid) to authenticated;

notify pgrst, 'reload schema';
