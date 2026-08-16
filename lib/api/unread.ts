// ─── Unread tracking (client-side, per-device) ───────────────────────────────
// Last-read timestamps live in AsyncStorage (no backend changes). Unread count
// per conversation = messages from others newer than my last-read mark.
// Good enough for MVP; server-side read receipts can replace this later.

import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../supabase'

const STORAGE_KEY = 'zzup_last_read_v1'
let cache: Record<string, string> | null = null

async function loadMap(): Promise<Record<string, string>> {
  if (cache) return cache
  try {
    cache = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? '{}')
  } catch {
    cache = {}
  }
  return cache!
}

/** Call when a conversation is opened / a new message is seen on screen. */
export async function markConversationRead(conversationId: string): Promise<void> {
  const map = await loadMap()
  map[conversationId] = new Date().toISOString()
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {}
}

/**
 * 会话列表的未读数。
 *
 * 走 RPC，不再客户端逐个 count(messages)（迁移 83）。原来那种算法**不看拉黑、
 * 也不看「清空聊天记录」**，于是出现「Lounge 显示有未读，点进去一条都没有」——
 * 被拉黑的消息算进了未读，却不会显示出来。
 *
 * 现在未读和消息读取共用同一套过滤，两者必然一致。
 * 已读标记仍存在本机 AsyncStorage（每台设备独立），所以要传给服务端。
 */
export async function getUnreadCounts(conversationIds: string[]): Promise<Record<string, number>> {
  if (conversationIds.length === 0) return {}
  const map = await loadMap()

  const { data, error } = await supabase.rpc('get_unread_counts', { p_marks: map })
  if (error) {
    console.warn('get_unread_counts failed:', error.message)
    return {}
  }

  const wanted = new Set(conversationIds)
  const counts: Record<string, number> = {}
  for (const row of (data ?? []) as { conversation_id: string; unread: number }[]) {
    if (wanted.has(row.conversation_id)) counts[row.conversation_id] = row.unread
  }
  return counts
}
