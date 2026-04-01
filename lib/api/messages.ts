import { supabase } from '../supabase'
import { addXP, getTodayStart, MESSAGE_THRESHOLD, MESSAGE_XP } from './_xp'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Message {
  id: string
  group_id: string
  user_id: string | null
  identity_mode: 'real' | 'pet'
  content: string
  image_url: string | null
  created_at: string
  edited_at: string | null
  // 从 profiles 联查（Realtime 推送的消息此字段为 null）
  author_name: string | null
  author_avatar_url: string | null
}

// ─── Task 77: getMessages ─────────────────────────────────────────────────────
// Returns messages in descending order (newest first).
// For pagination, pass the created_at of the oldest message in the current list as `before`.

export async function getMessages(
  groupId: string,
  limit = 30,
  before?: string
): Promise<Message[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  let query = supabase
    .from('messages')
    .select(
      `id, group_id, user_id, identity_mode, content, image_url, created_at, edited_at,
       profiles!messages_user_id_fkey (
         real_name, pet_name, avatar_url, pet_avatar_url
       )`
    )
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (before) query = query.lt('created_at', before)

  const { data } = await query
  if (!data) return []

  return data.map((m: any) => {
    const profile = m.profiles
    const isReal = m.identity_mode === 'real'
    return {
      id: m.id,
      group_id: m.group_id,
      user_id: m.user_id,
      identity_mode: m.identity_mode,
      content: m.content,
      image_url: m.image_url,
      created_at: m.created_at,
      edited_at: m.edited_at,
      author_name: profile ? (isReal ? profile.real_name : profile.pet_name) : null,
      author_avatar_url: profile ? (isReal ? profile.avatar_url : profile.pet_avatar_url) : null,
    }
  })
}

// ─── Task 78: sendMessage ─────────────────────────────────────────────────────

export async function sendMessage(
  groupId: string,
  content: string,
  identityMode: 'real' | 'pet',
  imageUrl?: string
): Promise<{ data: Message | null; error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      group_id: groupId,
      user_id: user.id,
      identity_mode: identityMode,
      content,
      image_url: imageUrl ?? null,
    })
    .select()
    .single()

  if (error) return { data: null, error: error.message }

  // XP: award MESSAGE_XP the first time today's message count reaches MESSAGE_THRESHOLD
  // Uses before/after diff so skipping over the threshold still triggers exactly once
  const todayStart = getTodayStart()
  const { count: msgToday } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', todayStart)
  if (msgToday !== null) {
    const xpBefore = (msgToday - 1) >= MESSAGE_THRESHOLD ? MESSAGE_XP : 0
    const xpAfter  = msgToday >= MESSAGE_THRESHOLD ? MESSAGE_XP : 0
    if (xpAfter > xpBefore) await addXP(user.id, MESSAGE_XP)
  }

  return { data: data as Message, error: null }
}

// ─── Task 79: subscribeToMessages ────────────────────────────────────────────
// Listens for new messages in a group via Supabase Realtime.
// Returns an unsubscribe function — call it when unmounting the screen.
//
// Usage:
//   const unsubscribe = subscribeToMessages(groupId, (msg) => setMessages(prev => [msg, ...prev]))
//   return () => unsubscribe()

export function subscribeToMessages(
  groupId: string,
  onMessage: (message: Message) => void
): () => void {
  const channel = supabase
    .channel(`messages:${groupId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `group_id=eq.${groupId}`,
      },
      async (payload) => {
        const msg = payload.new as any

        // Realtime payload 不含 profiles join，补查一次拿名字和头像
        let author_name: string | null = null
        let author_avatar_url: string | null = null

        if (msg.user_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('real_name, pet_name, avatar_url, pet_avatar_url')
            .eq('id', msg.user_id)
            .single()

          if (profile) {
            const isReal = msg.identity_mode === 'real'
            author_name = isReal ? profile.real_name : profile.pet_name
            author_avatar_url = isReal ? profile.avatar_url : profile.pet_avatar_url
          }
        }

        onMessage({
          id: msg.id,
          group_id: msg.group_id,
          user_id: msg.user_id,
          identity_mode: msg.identity_mode,
          content: msg.content,
          image_url: msg.image_url,
          created_at: msg.created_at,
          edited_at: msg.edited_at,
          author_name,
          author_avatar_url,
        })
      }
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}

// ─── Task 80: editMessage ─────────────────────────────────────────────────────

export async function editMessage(
  messageId: string,
  content: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('messages')
    .update({ content, edited_at: new Date().toISOString() })
    .eq('id', messageId)

  return { error: error?.message ?? null }
}
