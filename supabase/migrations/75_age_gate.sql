-- =============================================================================
-- 75_age_gate.sql
-- 18 岁年龄门槛（服务端强制）
--
-- 背景：terms.html / privacy.html 都已写死 "You must be at least 18 years old"，
-- 但代码里零校验 —— 生日是个自由文本框，输 2020-01-01 也能注册成功。
-- 见 docs/上线阻塞项_2026-08-14.md 第 1 条。
--
-- 这是**权威判定点**。客户端那个日期选择器（maximumDate = 今天减 18 年）只是
-- 让用户选不出未成年的日期，是体验层；真正拦得住抓包改请求的是这个触发器。
--
-- ⚠️ 必须放行 NULL：delete_my_account（迁移 67）会把 date_of_birth 置空，
--    触发器拦住的话删号流程会直接失败。
--
-- 关于「用户可以谎报生日」：管不了，也不需要管。Apple 指南和 COPPA 要求的是
-- **中立的年龄声明门槛**（neutral age gate），不是身份核验。行业标准做法就是这样。
--
-- 时区：一律按**美东**算，不跟随用户设备时区（运营范围本来就只有美国）。
-- 用命名时区 'America/New_York' 而不是写死 'EST' —— 后者不含夏令时，
-- 3 月到 11 月会差一小时。恰好卡在生日当天的边界情况极少，不做特殊处理。
--
-- 回滚：db-backups/2026-08-15/ROLLBACK_75.sql
-- =============================================================================

create or replace function public.enforce_minimum_age()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  -- 数据库会话时区是 UTC，直接用 current_date 会比美东快最多 5 小时。
  v_today date := (now() at time zone 'America/New_York')::date;
begin
  -- NULL 放行：删号会把生日置空，拦了删号就废了
  if new.date_of_birth is null then
    return new;
  end if;

  -- 未来的日期同样无意义，一并拒掉
  if new.date_of_birth > v_today then
    raise exception 'Date of birth cannot be in the future.'
      using errcode = '23514';
  end if;

  if new.date_of_birth > (v_today - interval '18 years') then
    raise exception 'You must be at least 18 years old to use zZuP!.'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_enforce_minimum_age on public.profiles;
create trigger trg_enforce_minimum_age
  before insert or update of date_of_birth on public.profiles
  for each row execute function public.enforce_minimum_age();
