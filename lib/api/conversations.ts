import { supabase } from '../supabase'
import type { IdentityType } from './friends'

// ─── Types ────────────────────────────────────────────────────────────────────
// 统一会话核心：kind = zzuper_talk / group / dm / petchat / driftbottle（见 27）。

export type ConversationKind =
  | 'zzuper_talk'
  | 'group'
  | 'dm'
  | 'petchat'
  | 'driftbottle'

// list_conversations 返回（已按 kind / 对方 member_identity / S_A 出展示）
export interface ConversationListItem {
  conversation_id: string
  kind: ConversationKind
  is_temporary: boolean
  expires_at: string | null
  status: 'active' | 'expired' | 'upgraded'
  my_identity: IdentityType
  peer_id: string | null
  display_name: string | null
  display_avatar: string | null
  // 展示身份是宠物时（zZuPer Talk / 对方以宠物身份出现）才有值 —— 迁移 64。
  // 头像取本地资产 assets/pets/png/{breed}_{stage}.png，见 components/PetAvatar。
  display_breed: string | null
  display_stage: string | null
  members_count: number
  last_message: string | null
  last_message_at: string | null
  // 每人一份的视图状态（迁移 76）
  is_muted: boolean
  // 只显示这个时间之后的消息；null = 从未清空过
  cleared_before: string | null
  /**
   * 临时会话已到期 = **冻结**（迁移 82）。
   *
   * 冻结不是删除：会话仍在列表里、历史仍可读、仍可举报和拉黑 ——
   * 会话消失的话 submit_report 的快照就是空的，举报在最需要它的场景失效。
   * 只是不能再发言（服务端触发器强制），也不能再加好友（客户端隐藏入口）。
   */
  is_frozen: boolean
  /**
   * 这是**当下**由 AI 代理在说话的会话（Pulse 匹配出来的）。
   *
   * 必须进 AgentChatScreen（有 AI 代理身份、接管提示、加好友入口），
   * 不能进普通的 ChatScreen —— 否则退出去再进来就变成一个普通私聊界面，
   * 接管状态和加好友入口全没了。
   *
   * 加好友之后 handle_friendship_update 会把它升级成 kind='dm'、
   * is_temporary=false，并**清掉这个标志**（迁移 87）：升级后的会话就是
   * 普通好友对话，只是历史里带着一段 AI 代理消息。所以这里判一个标志就够，
   * 不用再拼 `&& is_temporary`。
   */
  is_agent_chat: boolean
}

export interface GroupSummary {
  id: string
  name: string | null
  description: string | null
  avatar_url: string | null
  group_type: 'official' | 'edu_verified' | 'open' | null
  university: string | null
  members_count: number
  created_at: string
}

export interface ConversationMember {
  account_id: string
  member_identity: IdentityType
  role: 'admin' | 'member'
  joined_at: string
  display_name: string | null
  display_avatar: string | null
  // 该成员以宠物身份出现时才有值；头像取本地资产（components/PetAvatar）
  pet_breed: string | null
  pet_stage: string | null
}

// ─── 列表 ─────────────────────────────────────────────────────────────────────

export async function listConversations(): Promise<ConversationListItem[]> {
  const { data } = await supabase.rpc('list_conversations')
  return (data ?? []) as ConversationListItem[]
}

// ─── 固定宠物会话(zZuPer Talk)─────────────────────────────────────────────────
// 注册时已建；这里是幂等兜底，返回会话 id。

export async function getOrCreateZzuperTalk(): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_or_create_zzuper_talk')
  if (error) return null
  return data as string
}

// ─── 私聊四窗口 ────────────────────────────────────────────────────────────────
// myIdentity   = 我自选；targetIdentity = 对方呈现的身份。
// 同一(账号+身份)对复用同一窗口。

// 返回 { conversationId, error }，而不是光一个 id。
// 原来 error 被整个吞掉、只返回 null，调用方只能显示「Unable to start chat.」——
// 迁移 90 之后拒绝的原因多了一种（对方关了陌生人私信），再吞就等于让用户
// 对着一句无意义的报错猜。服务端的话本来就是写给用户看的，照原样带上去。
export async function createDM(
  targetId: string,
  myIdentity: IdentityType,
  targetIdentity: IdentityType
): Promise<{ conversationId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_dm', {
    p_target_id: targetId,
    p_my_identity: myIdentity,
    p_target_identity: targetIdentity,
  })
  if (error) return { conversationId: null, error: error.message }
  return { conversationId: data as string, error: null }
}

/**
 * AI 披露（纽约 GBL §1700：会话开始时 + 持续会话每 3 小时）。
 *
 * 返回 true = 现在该展示披露了，服务端已经把时间戳推到 now。
 * 判定完全在服务端，客户端不自己算时间 —— 本地状态出事时举不了证。
 *
 * 失败时返回 false（不展示）而不是抛错：这是合规装饰，不该因为
 * 一次网络抖动就把用户挡在聊天界面外面。漏展示一次的代价远小于聊不了天。
 */
export async function touchAiDisclosure(conversationId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('touch_ai_disclosure', {
    p_conversation: conversationId,
  })
  if (error) return false
  return data === true
}

// ─── 群聊 ─────────────────────────────────────────────────────────────────────

export async function createGroup(params: {
  name: string
  groupType: 'official' | 'edu_verified' | 'open'
  university?: string | null
  memberIds: string[] // 仅好友，含自己后须 ≥3 人
}): Promise<{ conversationId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_group', {
    p_name: params.name,
    p_group_type: params.groupType,
    p_university: params.university ?? null,
    p_member_ids: params.memberIds,
  })
  // create_group 这个 RPC 自己就把所有成员插好了；客户端不需要（也没有权限）
  // 再 upsert 一次 —— conversation_members 对 authenticated 只开放 SELECT。
  const conversationId = (data as string) ?? null
  return { conversationId, error: error?.message ?? null }
}

export async function joinGroup(conversationId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('join_group', { p_conversation_id: conversationId })
  return { error: error?.message ?? null }
}

export async function leaveGroup(conversationId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('leave_group', { p_conversation_id: conversationId })
  return { error: error?.message ?? null }
}

export async function transferGroupOwnership(
  conversationId: string,
  newOwnerId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('transfer_group_ownership', {
    p_conversation_id: conversationId,
    p_new_owner_id: newOwnerId,
  })
  return { error: error?.message ?? null }
}

export async function searchGroups(
  keyword: string,
  university?: string
): Promise<GroupSummary[]> {
  let query = supabase
    .from('conversations')
    .select('id, name, description, avatar_url, group_type, university, members_count, created_at')
    .eq('kind', 'group')
    .eq('is_searchable', true)
    .gte('members_count', 3)
    .ilike('name', `%${keyword}%`)

  if (university) {
    query = query.or(
      `group_type.in.(open,official),and(group_type.eq.edu_verified,university.eq.${university})`
    )
  }

  const { data } = await query
  return (data ?? []) as GroupSummary[]
}

// ─── 成员列表(群信息页 / 会话头)──────────────────────────────────────────────

// 必须走 RPC：conversation_members 的 RLS 只让你看见自己那一行，
// 直查拿不到别的成员（迁移 66 补的 list_conversation_members 是唯一合法入口）。
// 曾经这里有一段「查不到就拿 profiles 前 20 条冒充成员」的兜底 —— 已删除：
// 那会把陌生人显示成群成员，把故障伪装成正常数据。
export async function getConversationMembers(
  conversationId: string
): Promise<ConversationMember[]> {
  const { data, error } = await supabase.rpc('list_conversation_members', {
    p_conversation_id: conversationId,
  })

  if (error) {
    console.warn('list_conversation_members failed:', error.message)
    return []
  }

  return ((data ?? []) as any[]).map((m) => ({
    account_id: m.account_id,
    member_identity: m.member_identity ?? 'real',
    role: m.role ?? 'member',
    joined_at: m.joined_at,
    display_name: m.display_name ?? null,
    display_avatar: m.display_avatar ?? null,
    pet_breed: m.pet_breed ?? null,
    pet_stage: m.pet_stage ?? null,
  }))
}

// 踢人只能走 RPC：conversation_members 对客户端只开放 SELECT，
// 直接 delete 会被数据库拒绝（迁移 65 补了 remove_group_member）。
export async function removeMember(
  conversationId: string,
  accountId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('remove_group_member', {
    p_conversation_id: conversationId,
    p_account_id: accountId,
  })

  return { error: error?.message ?? null }
}

// ─── 会话视图状态（每人一份，迁移 76）────────────────────────────────────────
//
// 这三个操作**都不删任何消息**，只改「我」这一侧的可见性：
//   · 对方的聊天记录不受影响
//   · 举报快照（submit_report 取会话最近 50 条）仍然完整
//   · 涉未成年人内容的保存义务不被破坏
//
// 写一律走 RPC —— conversation_members 对客户端只开放 SELECT。

/** 清空聊天记录。**会话仍留在列表里**，只是记录对我不可见。 */
export async function clearConversationHistory(
  conversationId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('clear_conversation_history', {
    p_conversation: conversationId,
  })
  return { error: error?.message ?? null }
}

/**
 * 删除会话：从我的列表移除 + 清空记录。
 *
 * 想重新联系只能走好友列表 / 群列表，**新窗口是空的**。
 * 对方发来新消息时窗口会自动重新出现，同样只有新消息。
 */
export async function hideConversation(
  conversationId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('hide_conversation', {
    p_conversation: conversationId,
  })
  return { error: error?.message ?? null }
}

/** 免打扰。放服务端是因为它要拦的是服务器发出的推送。 */
export async function setConversationMuted(
  conversationId: string,
  muted: boolean
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_conversation_muted', {
    p_conversation: conversationId,
    p_muted: muted,
  })
  return { error: error?.message ?? null }
}

// ─── 匿名宠物身份（迁移 77/78/80）─────────────────────────────────────────────
//
// 匿名宠物**只能用「会话 + 代号」指代**。客户端拿不到它背后的账号 id ——
// 宠物消息的 sender_id 恒为 null，这是有意的：拿得到账号就能转手查出真名。
//
// 代号是分配一次、永不改变的（conversation_aliases 表），
// 且**按会话独立** —— 同一只宠物在不同会话里代号不同，跨会话串联不了。

export interface PetIdentity {
  alias: string
  pet_breed: string | null
  pet_stage: string | null
  /** 可直接显示的标签，如 "A Dog" */
  label: string
}

export async function getPetIdentity(
  conversationId: string,
  alias: string
): Promise<PetIdentity | null> {
  const { data, error } = await supabase.rpc('get_pet_identity', {
    p_conversation: conversationId,
    p_alias: alias,
  })
  if (error || !data) return null
  return data as PetIdentity
}

/** 拉黑的是**宠物身份**，对方用真人身份仍能联系你。 */
export async function blockPetByAlias(
  conversationId: string,
  alias: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('block_pet_by_alias', {
    p_conversation: conversationId,
    p_alias: alias,
  })
  return { error: error?.message ?? null }
}

export interface PeerProfile {
  id: string
  real_name: string | null
  avatar_url: string | null
  pet_breed: string | null
  pet_stage: string | null
}

/**
 * Pulse 匹配会话里对方的真实资料 —— **对方自己揭了面具才有值**，否则返回 null。
 *
 * 门槛在服务端（迁移 86）。原来在客户端：先拿到 id，再判断历史里有没有
 * 对方的真人消息，有才去查 —— 判断是对的，位置是错的，改个客户端就跳过了。
 */
export async function getConversationPeerProfile(
  conversationId: string
): Promise<PeerProfile | null> {
  const { data, error } = await supabase.rpc('conversation_peer_profile', {
    p_conversation: conversationId,
  })
  if (error || !data) return null
  return data as PeerProfile
}

/**
 * 这个会话是不是已经冻结（临时会话到期，迁移 82）。
 *
 * 冻结 = 只读：历史可读、可举报、可拉黑，但发不了消息。
 * 发言拦截在数据库触发器里，客户端这个查询只是为了**提前把输入框禁掉**，
 * 而不是让用户打完字才收到报错。
 */
export async function isConversationFrozen(conversationId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_conversation_frozen', {
    p_conversation: conversationId,
  })
  if (error) return false
  return data === true
}
