import { supabase } from '../supabase'
import { addXP, getTodayStart, POST_XP, COMMENT_XP, POST_COMMENT_DAILY_CAP } from './_xp'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Post {
  id: string
  user_id: string | null
  identity_mode: 'real' | 'pet'
  content: string
  image_url: string | null
  visibility: 'logged_in' | 'university' | 'friends' | 'specific_friends' | 'private'
  likes_count: number
  comments_count: number
  created_at: string
  edited_at: string | null
  // 从 profiles 联查
  author_name: string | null
  author_avatar_url: string | null
  // 当前用户是否已点赞
  liked_by_me: boolean
}

export interface Comment {
  id: string
  post_id: string
  user_id: string | null
  identity_mode: 'real' | 'pet'
  content: string
  created_at: string
  edited_at: string | null
  // 从 profiles 联查
  author_name: string | null
  author_avatar_url: string | null
}

// ─── 内部工具函数 ──────────────────────────────────────────────────────────────

// 从 Storage 公开 URL 中解析出相对路径
function extractStoragePath(url: string, bucket: string): string | null {
  const marker = `/object/public/${bucket}/`
  const idx = url.indexOf(marker)
  return idx !== -1 ? decodeURIComponent(url.slice(idx + marker.length)) : null
}

// 查询当前用户的双向拉黑列表，返回 Set<userId>
async function getBlockedIds(userId: string): Promise<Set<string>> {
  const [{ data: iBlockedData }, { data: blockedMeData }] = await Promise.all([
    supabase.from('blocked_users').select('blocked_id').eq('blocker_id', userId),
    supabase.from('blocked_users').select('blocker_id').eq('blocked_id', userId),
  ])
  return new Set([
    ...(iBlockedData ?? []).map((r: any) => r.blocked_id),
    ...(blockedMeData ?? []).map((r: any) => r.blocker_id),
  ])
}

// ─── Task 86: getFeed ─────────────────────────────────────────────────────────
// 获取 Feed 帖子列表，支持按 visibility 过滤，支持游标分页

export async function getFeed(options?: {
  visibility?: 'logged_in' | 'university' | 'friends' | 'specific_friends'
  limit?: number
  before?: string // 游标：最早帖子的 created_at
}): Promise<{ data: Post[]; error: string | null }> {
  const { visibility, limit = 20, before } = options ?? {}

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: [], error: 'Not authenticated' }

  // TD-3: 过滤双向屏蔽用户的帖子
  const blockedIds = await getBlockedIds(user.id)

  let query = supabase
    .from('posts')
    .select(
      `id, user_id, identity_mode, content, image_url, visibility,
       likes_count, comments_count, created_at, edited_at,
       profiles!posts_user_id_fkey (
         real_name, pet_name, avatar_url, pet_avatar_url
       )`
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (blockedIds.size > 0) query = query.not('user_id', 'in', `(${[...blockedIds].join(',')})`)
  if (visibility) query = query.eq('visibility', visibility)
  if (before) query = query.lt('created_at', before)

  const { data: postsData, error } = await query
  if (error) return { data: [], error: error.message }
  if (!postsData || postsData.length === 0) return { data: [], error: null }

  // 批量查当前用户对这些帖子的点赞状态
  const postIds = postsData.map((p: any) => p.id)
  const { data: myLikes } = await supabase
    .from('likes')
    .select('post_id')
    .eq('user_id', user.id)
    .in('post_id', postIds)

  const likedSet = new Set((myLikes ?? []).map((l: any) => l.post_id))

  const data = postsData.map((p: any) => {
    const profile = p.profiles
    const isReal = p.identity_mode === 'real'
    return {
      id: p.id,
      user_id: p.user_id,
      identity_mode: p.identity_mode,
      content: p.content,
      image_url: p.image_url,
      visibility: p.visibility,
      likes_count: p.likes_count,
      comments_count: p.comments_count,
      created_at: p.created_at,
      edited_at: p.edited_at,
      author_name: profile ? (isReal ? profile.real_name : profile.pet_name) : null,
      author_avatar_url: profile
        ? isReal
          ? profile.avatar_url
          : profile.pet_avatar_url
        : null,
      liked_by_me: likedSet.has(p.id),
    }
  })

  return { data, error: null }
}

// ─── TD-11: getPost ───────────────────────────────────────────────────────────
// 按 postId 查单条帖子。可见性由 RLS 自动过滤：无权限时返回 null。
// 作者被双向拉黑时同样返回 null，保持与 getFeed / getUserPosts 一致。

export async function getPost(
  postId: string
): Promise<{ data: Post | null; error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  const { data: post, error } = await supabase
    .from('posts')
    .select(
      `id, user_id, identity_mode, content, image_url, visibility,
       likes_count, comments_count, created_at, edited_at,
       profiles!posts_user_id_fkey (
         real_name, pet_name, avatar_url, pet_avatar_url
       )`
    )
    .eq('id', postId)
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  if (!post) return { data: null, error: null }

  // TD-3: 作者被双向拉黑 → 视作不可见
  const blockedIds = await getBlockedIds(user.id)
  if (post.user_id && blockedIds.has(post.user_id)) {
    return { data: null, error: null }
  }

  const { data: myLike } = await supabase
    .from('likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .maybeSingle()

  const profile = (post as any).profiles
  const isReal = post.identity_mode === 'real'
  const data: Post = {
    id: post.id,
    user_id: post.user_id,
    identity_mode: post.identity_mode,
    content: post.content,
    image_url: post.image_url,
    visibility: post.visibility,
    likes_count: post.likes_count,
    comments_count: post.comments_count,
    created_at: post.created_at,
    edited_at: post.edited_at,
    author_name: profile ? (isReal ? profile.real_name : profile.pet_name) : null,
    author_avatar_url: profile
      ? isReal
        ? profile.avatar_url
        : profile.pet_avatar_url
      : null,
    liked_by_me: !!myLike,
  }

  return { data, error: null }
}

// ─── Task 87: createPost ──────────────────────────────────────────────────────
// 发帖，imageUrl 由调用方上传到 post-images bucket 后传入

export async function createPost(
  content: string,
  identityMode: 'real' | 'pet',
  imageUrl?: string,
  visibility: 'logged_in' | 'university' | 'friends' | 'specific_friends' | 'private' = 'logged_in'
): Promise<{ postId: string | null; error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { postId: null, error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('posts')
    .insert({
      user_id: user.id,
      identity_mode: identityMode,
      content,
      image_url: imageUrl ?? null,
      visibility,
    })
    .select('id')
    .single()

  if (error) return { postId: null, error: error.message }

  // XP: count today's posts + comments (already created) and compute marginal gain
  const todayStart = getTodayStart()
  const [{ count: postsToday }, { count: commentsToday }] = await Promise.all([
    supabase.from('posts').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).gte('created_at', todayStart),
    supabase.from('comments').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).gte('created_at', todayStart),
  ])
  const p = postsToday ?? 1
  const c = commentsToday ?? 0
  const xpAfter  = Math.min(p * POST_XP + c * COMMENT_XP, POST_COMMENT_DAILY_CAP)
  const xpBefore = Math.min((p - 1) * POST_XP + c * COMMENT_XP, POST_COMMENT_DAILY_CAP)
  if (xpAfter > xpBefore) await addXP(user.id, xpAfter - xpBefore)

  return { postId: data.id, error: null }
}

// ─── Task 88: deletePost ──────────────────────────────────────────────────────
// 删除本人帖子，同时从 Storage 删除对应图片

export async function deletePost(postId: string): Promise<{ error: string | null }> {
  // 先取 image_url，再删帖子（RLS 限制只能删自己的帖）
  const { data: post } = await supabase
    .from('posts')
    .select('image_url')
    .eq('id', postId)
    .single()

  const { error } = await supabase.from('posts').delete().eq('id', postId)
  if (error) return { error: error.message }

  // 删除 Storage 中的图片
  if (post?.image_url) {
    const path = extractStoragePath(post.image_url, 'post-images')
    if (path) await supabase.storage.from('post-images').remove([path])
  }

  return { error: null }
}

// ─── Task 89: toggleLike ──────────────────────────────────────────────────────
// 点赞 / 取消点赞，likes_count 由 DB trigger on_like_change 自动维护

export async function toggleLike(
  postId: string
): Promise<{ liked: boolean; error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { liked: false, error: 'Not authenticated' }

  // 检查是否已点赞
  const { data: existing } = await supabase
    .from('likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    // 取消点赞
    const { error } = await supabase.from('likes').delete().eq('id', existing.id)
    if (error) return { liked: true, error: error.message }
    return { liked: false, error: null }
  } else {
    // 点赞
    const { error } = await supabase
      .from('likes')
      .insert({ post_id: postId, user_id: user.id })
    if (error) return { liked: false, error: error.message }
    return { liked: true, error: null }
  }
}

// ─── Task 90: getComments ─────────────────────────────────────────────────────
// 获取某帖子的所有评论，按 created_at 升序

export async function getComments(
  postId: string
): Promise<{ data: Comment[]; error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: [], error: 'Not authenticated' }

  // TD-3: 过滤双向屏蔽用户的评论
  const blockedIds = await getBlockedIds(user.id)

  let query = supabase
    .from('comments')
    .select(
      `id, post_id, user_id, identity_mode, content, created_at, edited_at,
       profiles!comments_user_id_fkey (
         real_name, pet_name, avatar_url, pet_avatar_url
       )`
    )
    .eq('post_id', postId)
    .order('created_at', { ascending: true })

  if (blockedIds.size > 0) query = query.not('user_id', 'in', `(${[...blockedIds].join(',')})`)

  const { data, error } = await query
  if (error) return { data: [], error: error.message }
  if (!data) return { data: [], error: null }

  const comments = data.map((c: any) => {
    const profile = c.profiles
    const isReal = c.identity_mode === 'real'
    return {
      id: c.id,
      post_id: c.post_id,
      user_id: c.user_id,
      identity_mode: c.identity_mode,
      content: c.content,
      created_at: c.created_at,
      edited_at: c.edited_at,
      author_name: profile ? (isReal ? profile.real_name : profile.pet_name) : null,
      author_avatar_url: profile
        ? isReal
          ? profile.avatar_url
          : profile.pet_avatar_url
        : null,
    }
  })

  return { data: comments, error: null }
}

// ─── Task 91: createComment ───────────────────────────────────────────────────
// 发评论，comments_count 由 DB trigger on_comment_change 自动维护

export async function createComment(
  postId: string,
  content: string,
  identityMode: 'real' | 'pet'
): Promise<{ commentId: string | null; error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { commentId: null, error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('comments')
    .insert({ post_id: postId, user_id: user.id, identity_mode: identityMode, content })
    .select('id')
    .single()

  if (error) return { commentId: null, error: error.message }

  // XP: count today's posts + comments (already created) and compute marginal gain
  const todayStart = getTodayStart()
  const [{ count: postsToday }, { count: commentsToday }] = await Promise.all([
    supabase.from('posts').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).gte('created_at', todayStart),
    supabase.from('comments').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).gte('created_at', todayStart),
  ])
  const p = postsToday ?? 0
  const c = commentsToday ?? 1
  const xpAfter  = Math.min(p * POST_XP + c * COMMENT_XP, POST_COMMENT_DAILY_CAP)
  const xpBefore = Math.min(p * POST_XP + (c - 1) * COMMENT_XP, POST_COMMENT_DAILY_CAP)
  if (xpAfter > xpBefore) await addXP(user.id, xpAfter - xpBefore)

  return { commentId: data.id, error: null }
}

// ─── Task 93: editPost ────────────────────────────────────────────────────────
// imageUrl 传 undefined = 不改图片；传 null = 删图；传新 URL = 换图

export async function editPost(
  postId: string,
  content: string,
  imageUrl?: string | null
): Promise<{ error: string | null }> {
  // 读取现有图片 URL（RLS 保证只有作者能读自己的帖）
  const { data: post } = await supabase
    .from('posts')
    .select('image_url')
    .eq('id', postId)
    .maybeSingle()

  if (!post) return { error: 'Post not found or permission denied' }

  const updatePayload: Record<string, unknown> = {
    content,
    edited_at: new Date().toISOString(),
  }
  if (imageUrl !== undefined) updatePayload.image_url = imageUrl

  const { error } = await supabase.from('posts').update(updatePayload).eq('id', postId)
  if (error) return { error: error.message }

  // 图片有变化且旧图存在且与新图不同 → 从 Storage 删除旧文件
  if (imageUrl !== undefined && post.image_url && post.image_url !== imageUrl) {
    const path = extractStoragePath(post.image_url, 'post-images')
    if (path) await supabase.storage.from('post-images').remove([path])
  }

  return { error: null }
}

// ─── Task 94: editComment ─────────────────────────────────────────────────────

export async function editComment(
  commentId: string,
  content: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('comments')
    .update({ content, edited_at: new Date().toISOString() })
    .eq('id', commentId)

  return { error: error?.message ?? null }
}

// ─── addPostViewer / removePostViewer ────────────────────────────────────────
// 仅限 specific_friends 帖子的作者调用，管理谁能看这条帖子

export async function addPostViewer(
  postId: string,
  friendId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('post_viewers')
    .insert({ post_id: postId, user_id: friendId })
  return { error: error?.message ?? null }
}

export async function removePostViewer(
  postId: string,
  friendId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('post_viewers')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', friendId)
  return { error: error?.message ?? null }
}

// ─── Task 103b: getUserPosts ──────────────────────────────────────────────────
// 查某用户的帖子列表，支持游标分页
// - 查自己：返回全部（含 private）
// - 查他人：visibility 由 RLS 自动过滤；双向拉黑时返回空数组

export async function getUserPosts(
  userId: string,
  options?: {
    limit?: number
    before?: string // 游标：上一页最后一条的 created_at
  }
): Promise<{ data: Post[]; error: string | null }> {
  const { limit = 20, before } = options ?? {}

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: [], error: 'Not authenticated' }

  // TD-3: 双向拉黑时过滤帖子（不拦截进入主页，只让帖子列表为空）
  const blockedIds = await getBlockedIds(user.id)
  if (blockedIds.has(userId)) return { data: [], error: null }

  let query = supabase
    .from('posts')
    .select(
      `id, user_id, identity_mode, content, image_url, visibility,
       likes_count, comments_count, created_at, edited_at,
       profiles!posts_user_id_fkey (
         real_name, pet_name, avatar_url, pet_avatar_url
       )`
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (before) query = query.lt('created_at', before)

  const { data: postsData, error } = await query
  if (error) return { data: [], error: error.message }
  if (!postsData || postsData.length === 0) return { data: [], error: null }

  // 批量查当前用户对这些帖子的点赞状态
  const postIds = postsData.map((p: any) => p.id)
  const { data: myLikes } = await supabase
    .from('likes')
    .select('post_id')
    .eq('user_id', user.id)
    .in('post_id', postIds)

  const likedSet = new Set((myLikes ?? []).map((l: any) => l.post_id))

  const data = postsData.map((p: any) => {
    const profile = p.profiles
    const isReal = p.identity_mode === 'real'
    return {
      id: p.id,
      user_id: p.user_id,
      identity_mode: p.identity_mode,
      content: p.content,
      image_url: p.image_url,
      visibility: p.visibility,
      likes_count: p.likes_count,
      comments_count: p.comments_count,
      created_at: p.created_at,
      edited_at: p.edited_at,
      author_name: profile ? (isReal ? profile.real_name : profile.pet_name) : null,
      author_avatar_url: profile
        ? isReal
          ? profile.avatar_url
          : profile.pet_avatar_url
        : null,
      liked_by_me: likedSet.has(p.id),
    }
  })

  return { data, error: null }
}

// ─── Task 92: deleteComment ───────────────────────────────────────────────────
// 删除本人评论，comments_count 由 DB trigger on_comment_change 自动维护

export async function deleteComment(commentId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('comments').delete().eq('id', commentId)
  if (error) return { error: error.message }
  return { error: null }
}
