-- =============================================================================
-- 63_chat_attachments.sql
-- 聊天图片/文件(多附件)支持 — 私聊/群聊 (messages 表,DM/群/Pulse 共用)
--
-- 纯增量改动(无 DROP/无改现有列/无动现有数据):
--   1) messages.attachments jsonb 列 (默认 '[]', 旧代码无感知)
--      每个元素: { kind: 'image'|'file', path, name, mime, size, w?, h? }
--      path = chat-media 桶内路径(不存公开 URL,读取用签名 URL,保匿名)
--   2) chat-media 私有存储桶
--   3) 成员制 RLS: 仅会话成员可上传/读取 (路径首段 = conversation_id)
--
-- 回滚脚本: 见 db-backups/2026-08-13/ROLLBACK_63.sql (本地备份目录)
-- =============================================================================

-- 1) 多附件列 (jsonb, 单条 insert 原子写入, realtime 载荷自带附件, 无竞态)
alter table public.messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- 2) 私有桶 (私聊/群聊媒体不可公开 — 见 docs/DEFERRED.md #12 匿名性要求)
insert into storage.buckets (id, name, public)
  values ('chat-media', 'chat-media', false)
  on conflict (id) do update set public = false;

-- 3) 成员制访问策略: 对象路径约定 {conversation_id}/{sender_uid}_{ts}_{filename}
drop policy if exists "chat_media_member_upload" on storage.objects;
create policy "chat_media_member_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id::text = (storage.foldername(name))[1]
        and cm.account_id = auth.uid()
    )
  );

drop policy if exists "chat_media_member_read" on storage.objects;
create policy "chat_media_member_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-media'
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id::text = (storage.foldername(name))[1]
        and cm.account_id = auth.uid()
    )
  );

drop policy if exists "chat_media_owner_delete" on storage.objects;
create policy "chat_media_owner_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'chat-media' and owner = auth.uid());

notify pgrst, 'reload schema';
