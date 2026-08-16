-- =============================================================================
-- 73_identity_scoped_profiles.sql
-- 身份维度的主页读取：完整主页 + 匿名场景的裸宠物
--
-- 背景决策（2026-08-15）：
--   1. **废弃 S_A 过滤**。`profile_visibility` 三值枚举同时做两件互相矛盾的事 ——
--      它让用户「藏真身」的代价是「公开宠物」，而宠物恰恰是匿名发言时用的身份。
--      等于为了藏脸把面具挂在门口。列暂时保留（不删，避免破坏性变更），但不再读。
--   2. **宠物强制上主页**，完整展示（名字 + 种类 + 形态 + 将来的装饰）。
--   3. **匿名场景（Pulse / Roam / 群聊）里的宠物一律裸形态**：
--      只有种类 + 形态 + 按会话生成的代号。无名字、无简介、无自定义头像、无装饰。
--
-- 残余风险（已知并接受，需写入隐私政策）：
--   裸形态仍带 10 种类 × 3 形态 = 30 桶的熵。全校几百人时不足以定位，
--   但在十来个人的小群里，一只「成年猫」大概率是唯一的。
--
-- 不做全局宠物 ID：它对性能是负优化（宠物就在 profiles 同一行，主键直查已最优），
-- 对举报追溯零增量（submit_report 本就服务端解析身份），
-- 而且一旦泄进任何返回体就成了**跨会话关联钥匙**，是破坏匿名的装置。
-- 代号按会话生成正是为了避免这一点。
--
-- 本迁移是**纯附加**的：不撤任何权限、不删任何东西，跑完现有功能一切照常。
-- 权限收紧在后续迁移，等客户端切到这些 RPC 之后再做。
--
-- 回滚：db-backups/2026-08-15/ROLLBACK_73.sql
-- =============================================================================

-- ── 会话内代号 ───────────────────────────────────────────────────────────────
-- 按 (会话, 账号) 生成稳定字母。用哈希排序而不是 joined_at：
-- 按加入时间排会泄露顺序 —— 小群里谁先进来往往是知道的，那就等于直接点名。
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
           -- 27 人以上：A1 / B1 / A2 …（26 人以上的群本来也没什么匿名可言）
           else chr(64 + (((n - 1) % 26) + 1)::int) || ((n - 1) / 26)::text
         end
  from ranked
  where account_id = p_account;
$function$;

-- ── 匿名场景的裸宠物 ─────────────────────────────────────────────────────────
-- **刻意不返回**：pet_name / pet_bio / pet_avatar_url / pet_level / zzup_id /
-- 账号 id / 任何真人字段。这个函数的返回体就是裸形态规则的执法点 ——
-- 客户端拿不到的东西，就渲染不出来。
--
-- 只有一个上下文类型：'conversation'（群聊 / Pulse 匹配聊天）。
-- Roam 不是匿名场景 —— 那是真人发帖，宠物只充当跑腿的趣味角色，作者本就公开。
create or replace function public.get_pet_identity(
  p_context_kind text,
  p_context_id   uuid,
  p_account      uuid
)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  p       public.profiles;
  v_alias text;
begin
  if auth.uid() is null then return null; end if;

  if p_context_kind = 'conversation' then
    -- 调用方必须在这个会话里，否则任何人都能拿 (会话, 账号) 组合去枚举
    if not exists (
      select 1 from public.conversation_members
      where conversation_id = p_context_id and account_id = auth.uid()
    ) then return null; end if;

    if not exists (
      select 1 from public.conversation_members
      where conversation_id = p_context_id and account_id = p_account
    ) then return null; end if;

    v_alias := public.pet_alias(p_context_id, p_account);

  else
    return null;
  end if;

  select * into p from public.profiles where id = p_account;
  if not found or p.deleted_at is not null then return null; end if;

  return json_build_object(
    'alias',      v_alias,
    'pet_breed',  p.pet_breed,
    'pet_stage',  p.pet_stage,
    -- 给客户端一个直接可显示的名字，避免各处自己拼、拼法不一致
    'label',      trim(both ' ' from
                    coalesce(v_alias || ' ', '') ||
                    initcap(replace(coalesce(p.pet_breed, 'pet'), '_', ' ')))
  );
end;
$function$;

grant execute on function public.get_pet_identity(text, uuid, uuid) to authenticated;

-- ── 完整主页：去掉 S_A 过滤 ──────────────────────────────────────────────────
-- 真人 + 宠物一律完整返回。仍然**不含** date_of_birth / personal_email /
-- edu_email —— 这三个任何时候都不对外，只折算成 age。
create or replace function public.get_other_profile(target_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare p public.profiles;
begin
  if auth.uid() is null then return null; end if;
  select * into p from public.profiles where id = target_id;
  if not found or p.deleted_at is not null then return null; end if;

  return json_build_object(
    'id',           p.id,
    'zzup_id',      p.zzup_id,
    'edu_verified', p.edu_verified,
    'created_at',   p.created_at,
    -- 真人身份
    'real_name',    p.real_name,
    'bio',          p.bio,
    'avatar_url',   p.avatar_url,
    'university',   p.university,
    'nationality',  p.nationality,
    'gender',       p.gender,
    'age',          case when p.date_of_birth is null then null
                         else extract(year from age(p.date_of_birth))::int end,
    'qr_code_url',  case when p.allow_add_via_qr then p.qr_code_url else null end,
    -- 宠物身份（强制展示）
    'pet_name',       p.pet_name,
    'pet_avatar_url', p.pet_avatar_url,
    'pet_bio',        p.pet_bio,
    'pet_level',      p.pet_level,
    'pet_stage',      p.pet_stage,
    'pet_breed',      p.pet_breed
  );
end;
$function$;

grant execute on function public.get_other_profile(uuid) to authenticated;

notify pgrst, 'reload schema';
