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
  /**
   * **宠物身份的消息这里恒为 null** —— 匿名马甲背后的账号 id 不给客户端。
   * 要指代它请用 author_alias（会话内代号），见迁移 77。
   */
  sender_id: string | null
  /** 服务端算好的「这条是不是我发的」。宠物消息拿不到 sender_id，只能靠它对齐左右。 */
  is_mine: boolean
  identity_mode: IdentityType
  content: string
  image_url: string | null
  attachments: Attachment[]
  created_at: string
  edited_at: string | null
  /** 真人=真名；宠物=代号标签（如 "A Dog"）。**永远不会是 pet_name**。 */
  author_name: string | null
  /** 宠物消息恒为 null —— 头像走本地 assets/pets/png/{breed}_{stage}.png */
  author_avatar_url: string | null
  author_pet_breed: string | null
  author_pet_stage: string | null
  /** 会话内代号，仅宠物消息有。跨会话不同，串联不了。 */
  author_alias: string | null
  /**
   * 这条是谁说的（迁移 94，写入时定死，不是读的时候猜的）：
   *   human      真人真身
   *   human_pet  真人顶着宠物马甲
   *   ai_pet     zZuPer Talk 里你自己的宠物 AI
   *   ai_proxy   Pulse 接管前的 AI 代聊
   * 举报时用它区分「举报一个人」和「举报 AI 输出」——
   * 后者没有人可以封，处置是改 prompt。
   */
  author_kind: 'human' | 'human_pet' | 'ai_pet' | 'ai_proxy' | null
}

/** 这条消息是不是机器说的（两种 AI 都算）。 */
export function isAiMessage(m: Message): boolean {
  return m.author_kind === 'ai_pet' || m.author_kind === 'ai_proxy'
}

function mapMessage(m: any): Message {
  return {
    id: m.id,
    conversation_id: m.conversation_id,
    sender_id: m.sender_id ?? null,
    is_mine: !!m.is_mine,
    identity_mode: m.identity_mode,
    content: m.content,
    image_url: m.image_url,
    attachments: Array.isArray(m.attachments) ? m.attachments : [],
    created_at: m.created_at,
    edited_at: m.edited_at,
    author_name: m.author_name ?? null,
    author_avatar_url: m.author_avatar_url ?? null,
    author_pet_breed: m.author_pet_breed ?? null,
    author_pet_stage: m.author_pet_stage ?? null,
    author_alias: m.author_alias ?? null,
    author_kind: m.author_kind ?? null,
  }
}

/**
 * 「Remove for me」——**只把这条消息从我的视图里移除**，不删任何东西。
 *
 * 消息永久保留是这个产品的核心设计（privacy / terms / safety 三份文书都写了
 * "nobody can delete a sent message"），所以这里写的是 hidden_messages，
 * 消息行原样留着，举报时服务端照样抓得到原文。
 *
 * 界面上**不要**把它叫成 Delete —— 用户会以为自己删掉了对方的消息。
 */
export async function hideMessageForMe(messageId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('hide_message_for_me', { p_message: messageId })
  return { error: error?.message ?? null }
}

// ─── getMessages ──────────────────────────────────────────────────────────────
// 降序（最新在前）。分页：把当前列表最旧一条的 created_at 作为 before。

/**
 * 走 RPC，不再直查 messages + 内嵌联查 profiles（迁移 77）。
 *
 * 三个原因：
 *   1. 宠物身份的消息必须裸形态返回 —— 直查会把 pet_name 原样发给客户端，
 *      而宠物名是自由文本，熵极高，匿名马甲等于直接报出自己是谁
 *   2. 原来的内嵌联查**依赖 profiles 的列级 SELECT 授权**，
 *      而那些授权在迁移 78 里被整体撤销了（全库 PII 可被任意登录用户拖走）
 *   3. 「清空聊天记录」的 cleared_before 过滤挪到服务端，少一次往返
 */
export async function getMessages(
  conversationId: string,
  limit = 30,
  before?: string
): Promise<Message[]> {
  const { data, error } = await supabase.rpc('list_messages', {
    p_conversation: conversationId,
    p_limit: limit,
    p_before: before ?? null,
  })

  if (error) {
    console.warn('list_messages failed:', error.message)
    return []
  }
  return ((data ?? []) as any[]).map(mapMessage)
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
        const raw = payload.new as any

        // Realtime 推来的是**原始行**，带着 sender_id、也不知道该显示真名还是代号。
        // 所以不直接用它，而是拿 id 回查一次 RPC，让服务端决定这条该以什么身份呈现
        // （宠物 → 裸形态；已被「清空聊天记录」盖掉的 → 返回 null，直接丢弃）。
        const { data } = await supabase.rpc('get_message', { p_message: raw.id })
        if (!data) return

        onMessage(mapMessage(data))
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
