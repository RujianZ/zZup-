-- ROLLBACK_102.sql —— 撤销 102_allow_voice_messages_in_chat_media.sql
--
-- ⚠️ 未实际执行验证过。
-- ⚠️ 回滚之后已经存在的 .m4a 对象**不会被删**，只是新的传不上来 ——
--    旧语音消息还能播（读取走签名 URL，不过扩展名白名单）。
--    真要清干净得另外删 storage.objects 里的 .m4a。
CREATE OR REPLACE FUNCTION public.storage_ext_allowed(p_bucket text, p_name text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case p_bucket
    when 'roam-media' then
      public.upload_ext(p_name) = any (array['jpg','jpeg','png','webp','gif'])
    when 'chat-media' then
      public.upload_ext(p_name) = any (array[
        'jpg','jpeg','png','webp','gif',
        'pdf','docx','xlsx','pptx','txt','md','csv','rtf',
        'doc','xls','ppt',
        'py','ipynb','js','mjs','cjs','ts','tsx','jsx','java','kt','swift',
        'c','h','cpp','hpp','cc','cs','go','rs','rb','php','scala','sql',
        'json','xml','yml','yaml','toml','ini','css','scss','tex','r','m'
      ])
    else true
  end;
$function$;
