import { supabase } from '../supabase'
import { addXP, getTodayStart, MESSAGE_THRESHOLD, MESSAGE_XP } from './_xp'
import type { IdentityType } from './friends'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Message {
  id: string
  conversation_id: string
  sender_id: string | null
  identity_mode: IdentityType // 逐条头像渲染依据（pet 段=宠物缩略头像）
  content: string
  image_url: string | null
  created_at: string
  edited_at: string | null
  // 从 profiles 联查（Realtime 推送的消息此字段为 null，再补查）
  author_name: string | null
  author_avatar_url: string | null
}

function mapMessage(m: any): Message {
  const profile = m.profiles
  const isPet = m.identity_mode === 'pet'
  return {
    id: m.id,
    conversation_id: m.conversation_id,
    sender_id: m.sender_id,
    identity_mode: m.identity_mode,
    content: m.content,
    image_url: m.image_url,
    created_at: m.created_at,
    edited_at: m.edited_at,
    author_name: profile ? (isPet ? profile.pet_name : profile.real_name) : null,
    author_avatar_url: profile ? (isPet ? profile.pet_avatar_url : profile.avatar_url) : null,
  }
}

// ─── getMessages ──────────────────────────────────────────────────────────────
// 降序（最新在前）。分页：把当前列表最旧一条的 created_at 作为 before。

export async function getMessages(
  conversationId: string,
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
      `id, conversation_id, sender_id, identity_mode, content, image_url, created_at, edited_at,
       profiles!messages_sender_id_fkey (
         real_name, pet_name, avatar_url, pet_avatar_url
       )`
    )
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (before) query = query.lt('created_at', before)

  const { data } = await query
  if (!data) return []
  return data.map(mapMessage)
}

// ─── sendMessage ──────────────────────────────────────────────────────────────

export async function sendMessage(
  conversationId: string,
  content: string,
  identityMode: IdentityType,
  imageUrl?: string
): Promise<{ data: Message | null; error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      identity_mode: identityMode,
      content,
      image_url: imageUrl ?? null,
    })
    .select()
    .single()

  if (error) return { data: null, error: error.message }

  // XP：今日消息数首次达到阈值时奖励一次（before/after diff，跳过阈值也只触发一次）
  const todayStart = getTodayStart()
  const { count: msgToday } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('sender_id', user.id)
    .gte('created_at', todayStart)
  if (msgToday !== null) {
    const xpBefore = msgToday - 1 >= MESSAGE_THRESHOLD ? MESSAGE_XP : 0
    const xpAfter = msgToday >= MESSAGE_THRESHOLD ? MESSAGE_XP : 0
    if (xpAfter > xpBefore) await addXP(user.id, MESSAGE_XP)
  }

  return { data: data as Message, error: null }
}

// ─── subscribeToMessages（Realtime）────────────────────────────────────────────
// 用法：const off = subscribeToMessages(id, m => setMsgs(prev => [m, ...prev])); return () => off()

export function subscribeToMessages(
  conversationId: string,
  onMessage: (message: Message) => void
): () => void {
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      async (payload) => {
        const msg = payload.new as any
        let author_name: string | null = null
        let author_avatar_url: string | null = null

        if (msg.sender_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('real_name, pet_name, avatar_url, pet_avatar_url')
            .eq('id', msg.sender_id)
            .single()
          if (profile) {
            const isPet = msg.identity_mode === 'pet'
            author_name = isPet ? profile.pet_name : profile.real_name
            author_avatar_url = isPet ? profile.pet_avatar_url : profile.avatar_url
          }
        }

        onMessage({
          id: msg.id,
          conversation_id: msg.conversation_id,
          sender_id: msg.sender_id,
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

  return () => {
    supabase.removeChannel(channel)
  }
}

// ─── editMessage ──────────────────────────────────────────────────────────────

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
