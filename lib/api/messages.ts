import { supabase } from '../supabase'

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
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (before) {
    query = query.lt('created_at', before)
  }

  const { data } = await query
  return (data ?? []) as Message[]
}

// ─── Task 78: sendMessage ─────────────────────────────────────────────────────

export async function sendMessage(
  groupId: string,
  content: string,
  identityMode: 'real' | 'pet',
  imageUrl?: string
): Promise<Message | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

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

  if (error) return null
  return data as Message
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
      (payload) => {
        onMessage(payload.new as Message)
      }
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}
