import { supabase, USE_MOCK } from '../supabase'
import { addXP, getTodayStart, MESSAGE_THRESHOLD, MESSAGE_XP } from './_xp'
import type { IdentityType } from './friends'
import type { Attachment } from './uploads'

// Registry to broadcast mock messages in real-time during offline testing
const mockMessageListeners = new Set<(message: Message) => void>()

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Message {
  id: string
  conversation_id: string
  sender_id: string | null
  identity_mode: IdentityType // 逐条头像渲染依据（pet 段=宠物缩略头像）
  content: string
  image_url: string | null
  attachments: Attachment[]
  created_at: string
  edited_at: string | null
  // 从 profiles 联查（Realtime 推送的消息此字段为 null，再补查）
  author_name: string | null
  author_avatar_url: string | null
  // 宠物形象标识：头像取本地资产 assets/pets/png/{breed}_{stage}.png，
  // pet_avatar_url 只是（尚未启用的）自定义头像位。identity_mode='real' 时为 null。
  author_pet_breed: string | null
  author_pet_stage: string | null
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
    attachments: Array.isArray(m.attachments) ? m.attachments : [],
    created_at: m.created_at,
    edited_at: m.edited_at,
    author_name: profile ? (isPet ? profile.pet_name : profile.real_name) : null,
    author_avatar_url: profile ? (isPet ? profile.pet_avatar_url : profile.avatar_url) : null,
    author_pet_breed: profile && isPet ? profile.pet_breed ?? null : null,
    author_pet_stage: profile && isPet ? profile.pet_stage ?? null : null,
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
      `id, conversation_id, sender_id, identity_mode, content, image_url, attachments, created_at, edited_at,
       profiles!messages_sender_id_fkey (
         real_name, pet_name, avatar_url, pet_avatar_url, pet_breed, pet_stage
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
  imageUrl?: string,
  attachments?: Attachment[]
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
      attachments: attachments ?? [],
    })
    .select()
    .single()

  if (error || !data) return { data: null, error: error?.message ?? 'Failed to send message' }

  // Trigger mock listeners in real-time during offline testing
  if (USE_MOCK) {
    setTimeout(() => {
      mockMessageListeners.forEach((listener) => {
        try {
          listener(data as Message)
        } catch (e) {
          console.error('Mock listener error:', e)
        }
      })
    }, 50)
  }

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
  if (USE_MOCK) {
    const listener = (msg: Message) => {
      if (msg.conversation_id === conversationId) {
        onMessage(msg)
      }
    }
    mockMessageListeners.add(listener)
    return () => {
      mockMessageListeners.delete(listener)
    }
  }

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
        let author_pet_breed: string | null = null
        let author_pet_stage: string | null = null

        if (msg.sender_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('real_name, pet_name, avatar_url, pet_avatar_url, pet_breed, pet_stage')
            .eq('id', msg.sender_id)
            .single()
          if (profile) {
            const isPet = msg.identity_mode === 'pet'
            author_name = isPet ? profile.pet_name : profile.real_name
            author_avatar_url = isPet ? profile.pet_avatar_url : profile.avatar_url
            author_pet_breed = isPet ? profile.pet_breed ?? null : null
            author_pet_stage = isPet ? profile.pet_stage ?? null : null
          }
        }

        onMessage({
          id: msg.id,
          conversation_id: msg.conversation_id,
          sender_id: msg.sender_id,
          identity_mode: msg.identity_mode,
          content: msg.content,
          image_url: msg.image_url,
          attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
          created_at: msg.created_at,
          edited_at: msg.edited_at,
          author_name,
          author_avatar_url,
          author_pet_breed,
          author_pet_stage,
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
