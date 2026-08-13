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

/** Batch unread counts for the conversation list. Only counts others' messages. */
export async function getUnreadCounts(conversationIds: string[]): Promise<Record<string, number>> {
  if (conversationIds.length === 0) return {}
  const map = await loadMap()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const counts: Record<string, number> = {}
  await Promise.all(conversationIds.map(async (id) => {
    let q = supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', id)
      .neq('sender_id', user.id)
    if (map[id]) q = q.gt('created_at', map[id])
    const { count } = await q
    if (count && count > 0) counts[id] = count
  }))
  return counts
}
