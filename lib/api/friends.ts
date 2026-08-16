import { supabase, USE_MOCK } from '../supabase'

const MOCK_RECENT_SEARCHES: UserSearchResult[] = [
  {
    id: 'user-monica',
    zzup_id: 'monica_xu',
    real_name: 'Monica Xu',
    pet_name: 'Coco',
    avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120',
    pet_avatar_url: null,
    university: 'zZuP University',
    edu_verified: true
  },
  {
    id: 'user-hci',
    zzup_id: 'hci_group',
    real_name: 'HCI Group',
    pet_name: null,
    avatar_url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=120',
    pet_avatar_url: null,
    university: 'zZuP University',
    edu_verified: true
  },
  {
    id: 'user-jazz',
    zzup_id: 'jazz_group',
    real_name: 'Jazz Group',
    pet_name: null,
    avatar_url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120',
    pet_avatar_url: null,
    university: 'zZuP University',
    edu_verified: false
  }
];

const MOCK_ALEX_GAN: UserSearchResult = {
  id: 'user-alex',
  zzup_id: 'alex_gan',
  real_name: 'Alex_Gan',
  pet_name: 'Mochi',
  avatar_url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=120',
  pet_avatar_url: null,
  university: 'zZuP University',
  edu_verified: true
};

const MOCK_TYPING_RESULTS: UserSearchResult[] = [
  {
    id: 'user-alice',
    zzup_id: 'aliceeeeee',
    real_name: 'Aliceeeeee',
    pet_name: 'Bunny',
    avatar_url: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120',
    pet_avatar_url: null,
    university: 'zZuP University',
    edu_verified: true
  },
  MOCK_ALEX_GAN,
  {
    id: 'user-alan',
    zzup_id: 'alan0106',
    real_name: 'Alan0106',
    pet_name: 'Sparky',
    avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120',
    pet_avatar_url: null,
    university: 'zZuP University',
    edu_verified: false
  }
];


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
  real_name: string | null
  avatar_url: string | null
  university: string | null
  pet_name: string | null
  pet_avatar_url: string | null
  edu_verified: boolean
  // 宠物形象标识（迁移 64）。头像取本地 assets/pets/png/{breed}_{stage}.png。
  pet_breed?: string | null
  pet_stage?: string | null
}

export type FriendItem = FriendProfile

export interface FriendRequest extends FriendProfile {
  created_at: string
}

export interface UserSearchResult {
  id: string
  zzup_id: string
  real_name: string | null
  avatar_url: string | null
  university: string | null
  pet_name: string | null
  pet_avatar_url: string | null
  edu_verified: boolean
  // 宠物形象标识（迁移 64）。头像取本地 assets/pets/png/{breed}_{stage}.png。
  pet_breed?: string | null
  pet_stage?: string | null
}

export interface BlockedUser {
  blocked_id: string
  blocked_identity_type: IdentityType
  /** 宠物身份为 null —— zzup_id 是账号级标识，给出来等于把马甲摘了 */
  zzup_id: string | null
  /**
   * 真人身份 = 真名；**宠物身份 = 代号标签**（如 "A Dog"），不是 pet_name。
   * 拉黑列表里显示宠物真名等于自己把匿名破了（迁移 83）。
   */
  display_name: string | null
  avatar_url: string | null
  // 宠物形象标识（头像取本地资产，见 components/PetAvatar）
  pet_breed: string | null
  pet_stage: string | null
  /** 「在哪拉黑的」，如群名或 "a zZuPer Pulse match"。宠物身份才有。 */
  via_label: string | null
  created_at: string
}

// ─── 好友请求（全部走 SECURITY DEFINER RPC，含拉黑/锁/三态机校验）──────────────

export async function sendFriendRequest(
  addresseeId: string,
  source?: FriendSource
): Promise<{ error: string | null }> {
  if (USE_MOCK) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ error: null });
      }, 500);
    });
  }

  const { error } = await supabase.rpc('send_friend_request', {
    p_addressee_id: addresseeId,
    p_source: source ?? null,
  })
  return { error: error?.message ?? null }
}

/**
 * Pulse 匹配会话里的加好友：**按会话寻址，不按账号 id**（迁移 86）。
 *
 * 客户端在这种会话里根本拿不到对方的账号 id —— conversation_members 的 RLS
 * 只让你看见自己那一行，而这正是匿名性的地基：拿到 id 就能转手查出真名。
 * 所以对方是谁在服务端解析，这边只递会话。
 */
export async function sendFriendRequestInConversation(
  conversationId: string
): Promise<{ error: string | null }> {
  if (USE_MOCK) return { error: null }
  const { error } = await supabase.rpc('send_friend_request_in_conversation', {
    p_conversation: conversationId,
  })
  return { error: error?.message ?? null }
}

/** 同上，按会话取好友状态。friendship_id 只在收到对方请求时有值（用于接受）。 */
export async function getConversationFriendship(
  conversationId: string
): Promise<{ status: FriendshipStatus; friendship_id: string | null }> {
  const { data, error } = await supabase.rpc('conversation_friendship_state', {
    p_conversation: conversationId,
  })
  if (error || !data) return { status: 'none', friendship_id: null }
  return data as { status: FriendshipStatus; friendship_id: string | null }
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

export async function getFriendRequestsCount(): Promise<number> {
  const requests = await getPendingRequests()
  return requests.length
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
  const kw = keyword.trim().toLowerCase();

  if (USE_MOCK) {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (!kw) {
          resolve(MOCK_RECENT_SEARCHES);
        } else if (kw === 'alex_gan' || kw === 'alex') {
          resolve([MOCK_ALEX_GAN]);
        } else if (kw.includes('al')) {
          resolve(MOCK_TYPING_RESULTS);
        } else {
          resolve([
            {
              id: `user-${kw}`,
              zzup_id: kw,
              real_name: keyword,
              pet_name: 'Companion',
              avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120',
              pet_avatar_url: null,
              university: 'zZuP University',
              edu_verified: false
            }
          ]);
        }
      }, 200);
    });
  }

  // 搜索失败必须返回空结果。曾经这里会**凭空捏造**一个 id 为 `user-<关键词>`
  // 的用户（配 Unsplash 头像 + "zZuP University"）—— 网络一抖用户搜什么就"找到"
  // 什么，点进去加好友必然失败。把故障伪装成数据比直接报错危险得多。
  try {
    const { data, error } = await supabase.rpc('search_users', { p_keyword: keyword });
    if (error) {
      console.warn('search_users failed:', error.message);
      return [];
    }
    return (data ?? []) as UserSearchResult[];
  } catch (e: any) {
    console.warn('search_users threw:', e?.message ?? e);
    return [];
  }
}

// ─── 我的拉黑列表(blocked_users SELECT 仅 blocker 可见)────────────────────────

export async function getBlockedUsers(): Promise<BlockedUser[]> {
  // 必须走 RPC。原来是 PostgREST 内嵌联查 `blocked:profiles!fk(...)`，
  // 依赖 profiles 的列级 SELECT 授权 —— 那些授权在迁移 79 里整体撤销了
  // （全库 PII 可被任意登录用户拖走），于是拉黑列表直接变空。
  const { data, error } = await supabase.rpc('list_blocked_identities')
  if (error) {
    console.warn('list_blocked_identities failed:', error.message)
    return []
  }

  return ((data ?? []) as any[]).map((b: any) => ({
    blocked_id: b.blocked_id,
    blocked_identity_type: b.blocked_identity_type,
    zzup_id: b.zzup_id ?? null,
    display_name: b.display_name ?? null,
    avatar_url: b.avatar_url ?? null,
    pet_breed: b.pet_breed ?? null,
    pet_stage: b.pet_stage ?? null,
    via_label: b.via_label ?? null,
    created_at: b.created_at,
  }))
}
