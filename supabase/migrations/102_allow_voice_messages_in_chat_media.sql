-- 102_allow_voice_messages_in_chat_media.sql
-- 语音消息：chat-media 的扩展名白名单加 m4a。
--
-- 已于 2026-08-19 应用到云端。回滚：db-backups/2026-08-19/ROLLBACK_102.sql
--
-- 只加 m4a —— 那是 expo-audio 在 iOS 和安卓上都产出的格式（AAC，
-- RecordingPresets.HIGH_QUALITY 的 extension 就是 .m4a）。不加 mp3/wav/aac：
-- 我们自己不产出它们，多一个扩展名就多一份能传进来的东西。
--
-- ⚠️ **roam-media 一个字没动。** Roam 是事先审的表面，而语音审不了
-- （OpenAI 的 moderation 接口只收文字和图片）。往事先审的表面上放审不了的
-- 内容，等于把那套设计废掉 —— 8-18 删掉 Roam 那个假录音就是这个理由。
-- 私聊/群聊本来就不审（总排查 §1.3），所以语音只进 chat-media 是自洽的。
--
-- 基线是 pg_get_functiondef 拉的线上定义。
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
        'm4a',
        'pdf','docx','xlsx','pptx','txt','md','csv','rtf',
        'doc','xls','ppt',
        'py','ipynb','js','mjs','cjs','ts','tsx','jsx','java','kt','swift',
        'c','h','cpp','hpp','cc','cs','go','rs','rb','php','scala','sql',
        'json','xml','yml','yaml','toml','ini','css','scss','tex','r','m'
      ])
    else true
  end;
$function$;
