-- 113 — 联系表单新增「隐私 / 数据请求」类别
--
-- 为什么需要它：
--
-- Play Console 的数据安全声明问「是否为用户提供了要求删除部分或全部数据的
-- 途径，让用户不必删除账号」。我们答「是」—— 依据是隐私政策 Your rights
-- 那节写死的承诺：来信 admin@zzup.org 可以要求知悉 / 更正 / 删除 / 导出，
-- 45 天内答复。
--
-- 但答「是」之后 Google 要一个**链接**。在此之前站上并没有一个落到
-- 「数据请求」这件事上的入口 —— 最接近的只有 contact 表单里的
-- 「Something else」。把一条有 45 天法定期限的请求混在 Something else 里，
-- 收件那头分不出轻重，等于承诺了却没有兑现的机制。
--
-- 所以补一个独立类别。这样：
--   · Google 那个链接可以直接指到 /contact?topic=data_request
--   · Discord 通知和自动回执能按 45 天口径走，而不是默认的 7 天
--
-- 注意：category 上有 CHECK 约束，光改前端下拉框会被数据库挡下来。

alter table public.contact_requests
  drop constraint contact_requests_category_check;

alter table public.contact_requests
  add constraint contact_requests_category_check
  check (category = any (array[
    'delete_account',
    'data_request',      -- 新增
    'account',
    'report',
    'partnership',
    'acquisition',
    'press',
    'other'
  ]));
