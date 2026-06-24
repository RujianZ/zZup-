import { supabase } from '../supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
// friendships 为真人↔真人。列表/搜索结果都按对方 S_A 过滤（见 26 的读取 RPC）。

export type IdentityType = 'real' | 'pet'

export type FriendSource =
  | 'search'
  | 'qr'
  | 'profile'
  | 'zzup_id'
  | 'petchat'
  | 'driftbottle'

export type FriendshipStatus =
  | 'none'
  | 'pending_sent'
  | 'pending_received'
  | 'accepted'
  | 'blocked'

export interface FriendProfile {
  friendship_id: string
  id: string
  zzup_id: string
  profile_visibility: 'real_only' | 'real_with_pet' | 'pet_only'
  real_name: string | null
  avatar_url: string | null
  university: string | null
  pet_name: string | null
  pet_avatar_url: string | null
  edu_verified: boolean
}

export interface FriendRequest extends FriendProfile {
  created_at: string
}

export interface UserSearchResult {
  id: string
  zzup_id: string
  profile_visibility: 'real_only' | 'real_with_pet' | 'pet_only'
  real_name: string | null
  avatar_url: string | null
  university: string | null
  pet_name: string | null
  pet_avatar_url: string | null
  edu_verified: boolean
}

export interface BlockedUser {
  blocked_id: string
  blocked_identity_type: IdentityType
  zzup_id: string
  real_name: string | null
  avatar_url: string | null
  pet_name: string | null
  pet_avatar_url: string | null
}

// ─── 好友请求（全部走 SECURITY DEFINER RPC，含拉黑/锁/三态机校验）──────────────

export async function sendFriendRequest(
  addresseeId: string,
  source?: FriendSource
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('send_friend_request', {
    p_addressee_id: addresseeId,
    p_source: source ?? null,
  })
  return { error: error?.message ?? null }
}

export async function respondFriendRequest(
  friendshipId: string,
  accept: boolean
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('respond_friend_request', {
    p_friendship_id: friendshipId,
    p_accept: accept,
  })
  return { error: error?.message ?? null }
}

export const acceptFriendRequest = (friendshipId: string) =>
  respondFriendRequest(friendshipId, true)
export const declineFriendRequest = (friendshipId: string) =>
  respondFriendRequest(friendshipId, false)

export async function cancelRequest(
  friendshipId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('cancel_friend_request', {
    p_friendship_id: friendshipId,
  })
  return { error: error?.message ?? null }
}

export async function removeFriend(
  friendshipId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('remove_friend', { p_friendship_id: friendshipId })
  return { error: error?.message ?? null }
}

// ─── 身份级拉黑 ────────────────────────────────────────────────────────────────

export async function blockIdentity(
  targetId: string,
  identityType: IdentityType
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('block_identity', {
    p_blocked_id: targetId,
    p_identity_type: identityType,
  })
  return { error: error?.message ?? null }
}

export async function unblockIdentity(
  targetId: string,
  identityType: IdentityType
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('unblock_identity', {
    p_blocked_id: targetId,
    p_identity_type: identityType,
  })
  return { error: error?.message ?? null }
}

// ─── 列表 / 状态(读取 RPC)──────────────────────────────────────────────────────

export async function getFriends(): Promise<FriendProfile[]> {
  const { data } = await supabase.rpc('list_friends')
  return (data ?? []) as FriendProfile[]
}

export async function getPendingRequests(): Promise<FriendRequest[]> {
  const { data } = await supabase.rpc('list_pending_requests')
  return (data ?? []) as FriendRequest[]
}

export async function getSentRequests(): Promise<FriendRequest[]> {
  const { data } = await supabase.rpc('list_sent_requests')
  return (data ?? []) as FriendRequest[]
}

export async function getFriendshipStatus(targetId: string): Promise<FriendshipStatus> {
  const { data } = await supabase.rpc('get_friendship_status', { p_target: targetId })
  return (data ?? 'none') as FriendshipStatus
}

export async function searchUsers(keyword: string): Promise<UserSearchResult[]> {
  const { data } = await supabase.rpc('search_users', { p_keyword: keyword })
  return (data ?? []) as UserSearchResult[]
}

// ─── 我的拉黑列表(blocked_users SELECT 仅 blocker 可见)────────────────────────

export async function getBlockedUsers(): Promise<BlockedUser[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('blocked_users')
    .select(
      `blocked_id, blocked_identity_type,
       blocked:profiles!blocked_users_blocked_id_fkey (
         zzup_id, real_name, avatar_url, pet_name, pet_avatar_url
       )`
    )
    .eq('blocker_id', user.id)

  if (!data) return []

  return data.map((b: any) => ({
    blocked_id: b.blocked_id,
    blocked_identity_type: b.blocked_identity_type,
    zzup_id: b.blocked.zzup_id,
    real_name: b.blocked.real_name,
    avatar_url: b.blocked.avatar_url,
    pet_name: b.blocked.pet_name,
    pet_avatar_url: b.blocked.pet_avatar_url,
  }))
}
