-- ROLLBACK_99.sql —— 撤销 99_contact_requests.sql
--
-- ⚠️ 这会**永久删掉所有联系/删号请求记录**，包括 acknowledged_at ——
--    而那一列是 CA AB 1394「36 小时内书面确认」的证据。
--    执行前先导出：
--      copy (select * from public.contact_requests) to stdout with csv header;
--
-- 另外 contact-submit 这个 Edge Function 会跟着失效（它往这张表写）。
-- 要一起撤的话：supabase functions delete contact-submit --project-ref ulrzilxhuuxxezhgrptg

drop table if exists public.contact_requests;
