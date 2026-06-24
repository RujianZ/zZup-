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
  members_count: number
  last_message: string | null
  last_message_at: string | null
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

export async function createDM(
  targetId: string,
  myIdentity: IdentityType,
  targetIdentity: IdentityType
): Promise<string | null> {
  const { data, error } = await supabase.rpc('create_dm', {
    p_target_id: targetId,
    p_my_identity: myIdentity,
    p_target_identity: targetIdentity,
  })
  if (error) return null
  return data as string
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
  return { conversationId: (data as string) ?? null, error: error?.message ?? null }
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

export async function getConversationMembers(
  conversationId: string
): Promise<ConversationMember[]> {
  const { data } = await supabase
    .from('conversation_members')
    .select(
      `account_id, member_identity, role, joined_at,
       profile:profiles!conversation_members_account_id_fkey (
         real_name, avatar_url, pet_name, pet_avatar_url
       )`
    )
    .eq('conversation_id', conversationId)

  if (!data) return []

  return data.map((m: any) => {
    const isPet = m.member_identity === 'pet'
    return {
      account_id: m.account_id,
      member_identity: m.member_identity,
      role: m.role,
      joined_at: m.joined_at,
      display_name: m.profile ? (isPet ? m.profile.pet_name : m.profile.real_name) : null,
      display_avatar: m.profile ? (isPet ? m.profile.pet_avatar_url : m.profile.avatar_url) : null,
    }
  })
}
