import { supabase } from '../supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FriendProfile {
  friendship_id: string
  id: string
  sudo_id: string
  real_name: string | null
  pet_name: string | null
  avatar_url: string | null
  pet_avatar_url: string | null
  university: string | null
  profile_visibility: 'real_only' | 'real_with_pet' | 'pet_only'
  identity_mode: 'real' | 'pet'
}

export interface FriendRequest {
  friendship_id: string
  id: string
  sudo_id: string
  real_name: string | null
  pet_name: string | null
  avatar_url: string | null
  pet_avatar_url: string | null
  university: string | null
  profile_visibility: 'real_only' | 'real_with_pet' | 'pet_only'
  identity_mode: 'real' | 'pet'
  created_at: string
}

export interface UserSearchResult {
  id: string
  sudo_id: string
  real_name: string | null
  pet_name: string | null
  avatar_url: string | null
  pet_avatar_url: string | null
  university: string | null
  profile_visibility: 'real_only' | 'real_with_pet' | 'pet_only'
  identity_mode: 'real' | 'pet'
}

export interface BlockedUser {
  blocked_id: string
  sudo_id: string
  real_name: string | null
  avatar_url: string | null
}

export type FriendshipStatus =
  | 'none'
  | 'pending_sent'
  | 'pending_received'
  | 'accepted'
  | 'blocked'

// ─── sendFriendRequest ────────────────────────────────────────────────────────
// 发送好友申请
// 前置检查：
//   1. 对方是否已向我发过申请（返回 error 提示去申请列表接受）
//   2. 是否存在屏蔽关系（双向，统一返回 '无法发送申请'）

export async function sendFriendRequest(
  addresseeId: string
): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // 检查屏蔽关系（我屏蔽了对方 或 对方屏蔽了我）
  const { data: blocks } = await supabase
    .from('blocked_users')
    .select('blocker_id')
    .or(
      `and(blocker_id.eq.${user.id},blocked_id.eq.${addresseeId}),and(blocker_id.eq.${addresseeId},blocked_id.eq.${user.id})`
    )
    .limit(1)

  if (blocks && blocks.length > 0) return { error: '无法发送申请' }

  // 检查对方是否已向我发过申请
  const { data: reverseRequest } = await supabase
    .from('friendships')
    .select('id')
    .eq('requester_id', addresseeId)
    .eq('addressee_id', user.id)
    .eq('status', 'pending')
    .maybeSingle()

  if (reverseRequest) return { error: '对方已向你发送了好友申请，请前往申请列表接受' }

  // 发送申请
  const { error } = await supabase
    .from('friendships')
    .insert({ requester_id: user.id, addressee_id: addresseeId })

  return { error: error?.message ?? null }
}

// ─── acceptFriendRequest ──────────────────────────────────────────────────────
// 接受好友申请（只有 addressee 可以操作，RLS 保证）

export async function acceptFriendRequest(
  friendshipId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId)

  return { error: error?.message ?? null }
}

// ─── declineFriendRequest ─────────────────────────────────────────────────────
// 拒绝好友申请（删除 pending 记录，只有 addressee 可以操作，RLS 保证）

export async function declineFriendRequest(
  friendshipId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId)
    .eq('status', 'pending')

  return { error: error?.message ?? null }
}

// ─── cancelRequest ────────────────────────────────────────────────────────────
// 撤回自己发出的好友申请（只有 requester 可以操作，RLS 保证）

export async function cancelRequest(
  friendshipId: string
): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId)
    .eq('requester_id', user.id)
    .eq('status', 'pending')

  return { error: error?.message ?? null }
}

// ─── removeFriend ─────────────────────────────────────────────────────────────
// 删除好友关系（双方均可操作，RLS 保证）

export async function removeFriend(
  friendshipId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId)

  return { error: error?.message ?? null }
}

// ─── blockUser ────────────────────────────────────────────────────────────────
// 屏蔽某用户，同时删除双方所有好友关系（pending + accepted）

export async function blockUser(
  targetId: string
): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // 插入屏蔽记录
  const { error: blockError } = await supabase
    .from('blocked_users')
    .insert({ blocker_id: user.id, blocked_id: targetId })

  if (blockError) return { error: blockError.message }

  // 删除所有好友关系（无论 pending 还是 accepted，无论谁是 requester）
  const { error: friendError } = await supabase
    .from('friendships')
    .delete()
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${user.id})`
    )

  return { error: friendError?.message ?? null }
}

// ─── unblockUser ──────────────────────────────────────────────────────────────
// 解除屏蔽

export async function unblockUser(
  targetId: string
): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', targetId)

  return { error: error?.message ?? null }
}

// ─── getFriends ───────────────────────────────────────────────────────────────
// 获取所有已接受的好友列表（含 profile 信息）

export async function getFriends(): Promise<FriendProfile[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('friendships')
    .select(
      `id, requester_id, addressee_id,
       requester:profiles!friendships_requester_id_fkey (
         id, sudo_id, real_name, pet_name, avatar_url, pet_avatar_url, university, profile_visibility, identity_mode
       ),
       addressee:profiles!friendships_addressee_id_fkey (
         id, sudo_id, real_name, pet_name, avatar_url, pet_avatar_url, university, profile_visibility, identity_mode
       )`
    )
    .eq('status', 'accepted')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)

  if (!data) return []

  return data.map((f: any) => {
    const friend = f.requester_id === user.id ? f.addressee : f.requester
    return {
      friendship_id: f.id,
      id: friend.id,
      sudo_id: friend.sudo_id,
      real_name: friend.real_name,
      pet_name: friend.pet_name,
      avatar_url: friend.avatar_url,
      pet_avatar_url: friend.pet_avatar_url,
      university: friend.university,
      profile_visibility: friend.profile_visibility,
      identity_mode: friend.identity_mode,
    }
  })
}

// ─── getPendingRequests ───────────────────────────────────────────────────────
// 获取收到的好友申请列表（含申请人 profile 信息）

export async function getPendingRequests(): Promise<FriendRequest[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('friendships')
    .select(
      `id, created_at,
       requester:profiles!friendships_requester_id_fkey (
         id, sudo_id, real_name, pet_name, avatar_url, pet_avatar_url, university, profile_visibility, identity_mode
       )`
    )
    .eq('status', 'pending')
    .eq('addressee_id', user.id)

  if (!data) return []

  return data.map((f: any) => ({
    friendship_id: f.id,
    created_at: f.created_at,
    id: f.requester.id,
    sudo_id: f.requester.sudo_id,
    real_name: f.requester.real_name,
    pet_name: f.requester.pet_name,
    avatar_url: f.requester.avatar_url,
    pet_avatar_url: f.requester.pet_avatar_url,
    university: f.requester.university,
    profile_visibility: f.requester.profile_visibility,
    identity_mode: f.requester.identity_mode,
  }))
}

// ─── getSentRequests ──────────────────────────────────────────────────────────
// 获取自己发出的好友申请列表（含对方 profile 信息）

export async function getSentRequests(): Promise<FriendRequest[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('friendships')
    .select(
      `id, created_at,
       addressee:profiles!friendships_addressee_id_fkey (
         id, sudo_id, real_name, pet_name, avatar_url, pet_avatar_url, university, profile_visibility, identity_mode
       )`
    )
    .eq('status', 'pending')
    .eq('requester_id', user.id)

  if (!data) return []

  return data.map((f: any) => ({
    friendship_id: f.id,
    created_at: f.created_at,
    id: f.addressee.id,
    sudo_id: f.addressee.sudo_id,
    real_name: f.addressee.real_name,
    pet_name: f.addressee.pet_name,
    avatar_url: f.addressee.avatar_url,
    pet_avatar_url: f.addressee.pet_avatar_url,
    university: f.addressee.university,
    profile_visibility: f.addressee.profile_visibility,
    identity_mode: f.addressee.identity_mode,
  }))
}

// ─── getFriendshipStatus ──────────────────────────────────────────────────────
// 查询当前用户与某人的关系状态
// 返回值：none | pending_sent | pending_received | accepted | blocked
// 注意：若对方屏蔽了你，返回 none（不暴露屏蔽信息）

export async function getFriendshipStatus(
  targetId: string
): Promise<FriendshipStatus> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 'none'

  // 检查我是否屏蔽了对方
  const { data: block } = await supabase
    .from('blocked_users')
    .select('blocked_id')
    .eq('blocker_id', user.id)
    .eq('blocked_id', targetId)
    .maybeSingle()

  if (block) return 'blocked'

  // 查询好友关系
  const { data: friendship } = await supabase
    .from('friendships')
    .select('id, status, requester_id')
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${user.id})`
    )
    .maybeSingle()

  if (!friendship) return 'none'
  if (friendship.status === 'accepted') return 'accepted'
  if (friendship.requester_id === user.id) return 'pending_sent'
  return 'pending_received'
}

// ─── searchUsers ──────────────────────────────────────────────────────────────
// 搜索用户：sudo_id 精确匹配 或 real_name 模糊匹配
// 过滤：排除自己、排除双向屏蔽的用户

export async function searchUsers(keyword: string): Promise<UserSearchResult[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  // 查出双向屏蔽的用户 ID（我屏蔽的 + 屏蔽我的）
  const [{ data: iBlocked }, { data: blockedMe }] = await Promise.all([
    supabase.from('blocked_users').select('blocked_id').eq('blocker_id', user.id),
    supabase.from('blocked_users').select('blocker_id').eq('blocked_id', user.id),
  ])

  const excludeIds = [
    user.id,
    ...(iBlocked ?? []).map((r: any) => r.blocked_id),
    ...(blockedMe ?? []).map((r: any) => r.blocker_id),
  ]

  let query = supabase
    .from('profiles')
    .select('id, sudo_id, real_name, pet_name, avatar_url, pet_avatar_url, university, profile_visibility, identity_mode')
    .or(`sudo_id.eq.${keyword},real_name.ilike.%${keyword}%`)
    .limit(20)

  if (excludeIds.length > 0) {
    query = query.not('id', 'in', `(${excludeIds.join(',')})`)
  }

  const { data } = await query
  return (data ?? []) as UserSearchResult[]
}

// ─── getBlockedUsers ──────────────────────────────────────────────────────────
// 获取自己屏蔽的用户列表

export async function getBlockedUsers(): Promise<BlockedUser[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('blocked_users')
    .select(
      `blocked_id,
       blocked:profiles!blocked_users_blocked_id_fkey (
         sudo_id, real_name, avatar_url
       )`
    )
    .eq('blocker_id', user.id)

  if (!data) return []

  return data.map((b: any) => ({
    blocked_id: b.blocked_id,
    sudo_id: b.blocked.sudo_id,
    real_name: b.blocked.real_name,
    avatar_url: b.blocked.avatar_url,
  }))
}
