-- 96_storage_hardening_and_roam_media.sql
--
-- 目的（2026-08-18）：
--   1. Roam 的图片从「用户粘贴的任意外链」改成「上传到我们自己的私有桶」。
--      原来 FreeTravelScreen 是一个 TextInput 让用户填 https://... 然后直接 <Image> 渲染，
--      后果：(a) 事先审核毫无意义，外链可在审过后换内容；(b) 每个查看者的 IP
--      都会被送给发帖人控制的服务器，是我们自己造的去匿名通道。
--   2. 给所有附件加**服务端**的大小与扩展名限制。
--      现状：uploads.ts 里的 50MB 是纯客户端检查，桶的 file_size_limit 是 null，
--      DocumentPicker 没有 type 过滤 —— 改个客户端就能传 .exe/.apk/.zip。
--
-- 设计要点（踩过的坑，别改回去）：
--   * **按扩展名判，不按 MIME。** DocumentPicker 在 Android 上对 .py/.rs 这类
--     经常返回 application/octet-stream 或空。给 chat-media 设 allowed_mime_types
--     会随机误伤合法的代码文件 —— 所以 chat-media **故意不设** allowed_mime_types，
--     只靠下面的扩展名 RESTRICTIVE 策略。roam-media 因为只走 ImagePicker +
--     normalizeImage（永远输出 JPEG），MIME 白名单是安全的，所以设。
--   * **必须是 RESTRICTIVE 策略。** PERMISSIVE 策略之间是 OR，再加一条只会多开一个口子；
--     要收紧就得用 AS RESTRICTIVE（与现有策略 AND）。
--   * 所有函数带 set search_path —— 顾问报过 11 个 search_path 可劫持的函数，不再新增。
--
-- 回滚：db-backups/2026-08-18/ROLLBACK_96.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 扩展名提取 + 白名单
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.upload_ext(p_name text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select lower(coalesce(substring(p_name from '\.([A-Za-z0-9]+)$'), ''));
$$;

comment on function public.upload_ext(text) is
  '取文件名末尾的扩展名（小写，不含点）。取不到返回空串。';

create or replace function public.storage_ext_allowed(p_bucket text, p_name text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_bucket
    -- Roam：广播给陌生人，只允许图片。不含 svg —— svg 是可带脚本的 XML，不是图片。
    when 'roam-media' then
      public.upload_ext(p_name) = any (array['jpg','jpeg','png','webp','gif'])

    -- 私聊/群聊：允许图片 + 课业文档 + 代码。
    when 'chat-media' then
      public.upload_ext(p_name) = any (array[
        -- 图片
        'jpg','jpeg','png','webp','gif',
        -- 文档（docx/xlsx/pptx 是 OOXML，宏必须用 m 变体，所以这三个安全）
        'pdf','docx','xlsx','pptx','txt','md','csv','rtf',
        -- 老 Office：教授还在发这些。理论上 OLE 能带宏，但手机端不会跑
        'doc','xls','ppt',
        -- 代码 / 数据（都是惰性文本，不含 sh/bat/ps1/cmd —— 那些是可执行脚本）
        'py','ipynb','js','mjs','cjs','ts','tsx','jsx','java','kt','swift',
        'c','h','cpp','hpp','cc','cs','go','rs','rb','php','scala','sql',
        'json','xml','yml','yaml','toml','ini','css','scss','tex','r','m'
      ])

    -- 其他桶（avatars / report-media / offer-screenshots）不受这条策略约束
    else true
  end;
$$;

comment on function public.storage_ext_allowed(text, text) is
  '按桶判断扩展名是否在白名单内。明确排除：可执行(exe/apk/dmg/msi/jar/bat/sh/ps1)、'
  '不透明容器(zip/rar/7z/tar/gz)、宏启用 Office(docm/xlsm/pptm)、可带脚本(svg/html)。';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RESTRICTIVE 策略：扩展名不在白名单就不许写入
--    这是真正的强制层 —— 改客户端绕不过去。
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "attachment_extension_whitelist" on storage.objects;

create policy "attachment_extension_whitelist"
on storage.objects
as restrictive
for insert
to authenticated
with check ( public.storage_ext_allowed(bucket_id, name) );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. roam-media 桶
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'roam-media', 'roam-media', false,
  20 * 1024 * 1024,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 路径约定：{uid}/{timestamp}_{sanitizedName}
drop policy if exists "roam_media_owner_upload" on storage.objects;
create policy "roam_media_owner_upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'roam-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 读：任何已登录用户，但**仅限被某条 travel_posts 引用的对象**。
-- 这样没被引用的孤儿上传谁也读不到，桶也不能被随意翻。
-- 外加所有者永远能读自己的。
drop policy if exists "roam_media_read" on storage.objects;
create policy "roam_media_read"
on storage.objects for select to authenticated
using (
  bucket_id = 'roam-media'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.travel_posts tp where tp.image_url = storage.objects.name)
  )
);

drop policy if exists "roam_media_owner_delete" on storage.objects;
create policy "roam_media_owner_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'roam-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. chat-media：加服务端大小上限
--    故意不设 allowed_mime_types —— 见文件头的说明。
-- ─────────────────────────────────────────────────────────────────────────────

update storage.buckets
   set file_size_limit = 40 * 1024 * 1024
 where id = 'chat-media';

-- report-media 只收举报截图，按图片处理
update storage.buckets
   set file_size_limit = 20 * 1024 * 1024
 where id = 'report-media';
