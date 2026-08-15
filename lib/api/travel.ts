import { supabase } from '../supabase';

export interface TravelPost {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  audio_url: string | null;
  started_at: string;
  ends_at: string;
  duration_hours?: number;
  remaining_seconds?: number;
  view_count: number;
  status: 'traveling' | 'returned';
  // 终态标记（迁移 69）：非空 = 主人已迎接，这趟旅行归档，不再占用「当前旅行」槽位。
  // status 只有 traveling/returned 两个值，没有"已确认收工"的表达，所以单开一列。
  welcomed_at?: string | null;
  similarity?: number;
  author_profile?: {
    id: string;
    real_name: string | null;
    pet_name: string | null;
    pet_breed: string | null;
    avatar_url: string | null;
    pet_avatar_url: string | null;
    university: string | null;
  } | null;
}

export interface TravelComment {
  id: string;
  travel_post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author_name?: string | null;
  author_avatar_url?: string | null;
}

/**
 * 启动自由旅行 (发漂流瓶)
 */
export async function createTravelPost(
  content: string,
  imageUrl?: string,
  audioUrl?: string,
  durationHours: number = 6
): Promise<{ post: TravelPost | null; error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('travel-mode', {
      body: {
        action: 'create',
        content,
        image_url: imageUrl,
        audio_url: audioUrl,
        duration_hours: durationHours
      },
    });

    if (error) return { post: null, error: error.message || 'Failed to start travel' };
    if (data?.error) return { post: null, error: data.error };

    return { post: data.post, error: null };
  } catch (err: any) {
    return { post: null, error: err.message || 'Network error starting travel' };
  }
}

/**
 * 提前召回宠物回家
 */
export async function recallTravelPet(postId: string): Promise<{ remainingSeconds: number; error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { remainingSeconds: 0, error: 'Not authenticated' };

  const { data, error } = await supabase.rpc('recall_travel_pet', {
    p_post_id: postId,
    p_user_id: user.id
  });

  if (error) return { remainingSeconds: 0, error: error.message };
  return { remainingSeconds: data?.remaining_seconds || 0, error: null };
}

/**
 * 带着老帖重发/一键续期漫游
 */
export async function renewTravelPost(postId: string, durationHours: number = 6): Promise<{ error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data, error } = await supabase.rpc('renew_travel_post', {
    p_post_id: postId,
    p_user_id: user.id,
    p_duration_hours: durationHours
  });

  if (error) return { error: error.message };
  return { error: data?.error || null };
}

/**
 * 记录已看曝光 (阅后即避去重)
 */
export async function recordTravelPostView(postId: string): Promise<{ error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase.rpc('record_travel_post_view', {
    p_post_id: postId,
    p_user_id: user.id
  });

  return { error: error ? error.message : null };
}


/**
 * 匹配附近正在旅行的其他宠物 (同校优先 -> 向量相似排序)
 */
export async function getMatchedTravelPosts(): Promise<{ posts: TravelPost[]; error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('travel-mode', {
      body: {
        action: 'match',
      },
    });

    if (error) return { posts: [], error: error.message || 'Failed to retrieve travel posts' };
    if (data?.error) return { posts: [], error: data.error };

    return { posts: data.posts || [], error: null };
  } catch (err: any) {
    return { posts: [], error: err.message || 'Network error fetching travel posts' };
  }
}

/**
 * 浏览旅行帖子 (增加阅读量)
 */
export async function incrementTravelPostView(postId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('increment_travel_post_view', {
    post_id: postId,
  });

  return { error: error ? error.message : null };
}

/**
 * 给路过的旅行宠物留言
 */
export async function createTravelComment(
  postId: string,
  content: string
): Promise<{ commentId: string | null; error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { commentId: null, error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('travel_comments')
    .insert({
      travel_post_id: postId,
      author_id: user.id,
      content: content.trim(),
    })
    .select('id')
    .single();

  if (error) {
    // Unique constraint prevents multiple comments
    if (error.code === '23505') {
      return { commentId: null, error: '你已经给这只宠物留言过啦！' };
    }
    return { commentId: null, error: error.message };
  }

  return { commentId: data.id, error: null };
}

/**
 * 获取当前用户的活动旅行状态 (正在旅行或者已经旅行结束未迎回)
 */
export async function getActiveTravelPost(): Promise<{ post: TravelPost | null; error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { post: null, error: 'Not authenticated' };

  try {
    const { data, error } = await supabase
      .from('travel_posts')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['traveling', 'returned'])
      .is('welcomed_at', null)   // 已迎接过的旅行不再占用「当前旅行」槽位（迁移 69）
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return { post: null, error: error.message };
    
    // Robust runtime check to handle empty array/object or malformed records
    if (!data) return { post: null, error: null };
    
    if (Array.isArray(data)) {
      if (data.length === 0) return { post: null, error: null };
      const singlePost = data[0];
      if (singlePost && singlePost.id && singlePost.ends_at) {
        return { post: singlePost as TravelPost, error: null };
      }
      return { post: null, error: null };
    }
    
    if (typeof data === 'object') {
      if (!data.id || !data.ends_at) {
        return { post: null, error: null };
      }
      return { post: data as TravelPost, error: null };
    }
    
    return { post: null, error: null };
  } catch (err: any) {
    return { post: null, error: err.message || 'Error loading active travel post' };
  }
}

/**
 * 获取某个旅行帖子的全部留言
 */
export async function getTravelComments(postId: string): Promise<{ comments: TravelComment[]; error: string | null }> {
  const { data, error } = await supabase
    .from('travel_comments')
    .select(`
      id,
      travel_post_id,
      author_id,
      content,
      created_at,
      profiles!travel_comments_author_id_fkey (
        real_name,
        pet_name,
        avatar_url,
        pet_avatar_url
      )
    `)
    .eq('travel_post_id', postId)
    .order('created_at', { ascending: true });

  if (error) return { comments: [], error: error.message };

  const formatted: TravelComment[] = (data || []).map((c: any) => {
    const profile = c.profiles;
    return {
      id: c.id,
      travel_post_id: c.travel_post_id,
      author_id: c.author_id,
      content: c.content,
      created_at: c.created_at,
      author_name: profile?.pet_name || profile?.real_name || '匿名的毛孩子',
      author_avatar_url: profile?.pet_avatar_url || profile?.avatar_url || null,
    };
  });

  return { comments: formatted, error: null };
}

/**
 * 迎回旅行归来的宠物 —— 给这趟旅行盖上终态戳。
 *
 * 曾经这里写的是 `update({ status: 'returned' })`，但帖子本来就已经是 'returned'，
 * 这个更新什么都没改；下次 getActiveTravelPost 又把同一条查出来，界面无限弹回
 * 「宠物回家了」。status 的 CHECK 只有 traveling/returned 两个值，**没有任何值
 * 表示"已确认收工"** —— 迁移 69 补的 welcomed_at 就是这个终态。
 */
export async function welcomePetHome(postId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('travel_posts')
    .update({ status: 'returned', welcomed_at: new Date().toISOString() })
    .eq('id', postId);

  return { error: error ? error.message : null };
}

/**
 * 发起 3 小时蒸发的临时直聊对话
 */
export async function createTemporaryDirectMessage(friendId: string): Promise<{ group: any | null; error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { group: null, error: 'Not authenticated' };

  // Check if a direct temporary conversation (petchat) already exists
  const [{ data: myDMs }, { data: theirDMs }] = await Promise.all([
    supabase
      .from('conversation_members')
      .select('conversation_id, conversations!inner(kind)')
      .eq('account_id', user.id)
      .eq('conversations.kind', 'petchat'),
    supabase
      .from('conversation_members')
      .select('conversation_id, conversations!inner(kind)')
      .eq('account_id', friendId)
      .eq('conversations.kind', 'petchat'),
  ]);

  const myDMIds = new Set((myDMs ?? []).map((r: any) => r.conversation_id));
  const sharedGroupId = (theirDMs ?? []).find((r: any) => myDMIds.has(r.conversation_id))?.conversation_id;

  if (sharedGroupId) {
    const { data: existing, error: existErr } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', sharedGroupId)
      .single();
    if (existErr) return { group: null, error: existErr.message };
    return { group: existing, error: null };
  }

  // Calculate expires_at: 3 hours from now
  const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();

  // Create new temporary conversation
  const { data: conversation, error: insertErr } = await supabase
    .from('conversations')
    .insert({
      kind: 'petchat',
      name: '',
      is_searchable: false,
      created_by: user.id,
      members_count: 2,
      is_temporary: true,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (insertErr || !conversation) return { group: null, error: insertErr?.message || 'Failed to create conversation' };

  const { error: memberErr } = await supabase.from('conversation_members').insert([
    { conversation_id: conversation.id, account_id: user.id, member_identity: 'pet', role: 'member' },
    { conversation_id: conversation.id, account_id: friendId, member_identity: 'pet', role: 'member' },
  ]);

  if (memberErr) {
    return { group: null, error: memberErr.message };
  }

  return { group: conversation, error: null };
}

/**
 * 回复旅行中的留言，开启 24 小时临时直聊 (蒸发窗口)
 */
export async function replyToTravelComment(
  commentId: string,
  replyContent: string
): Promise<{ groupId: string | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('reply_to_travel_comment', {
      p_comment_id: commentId,
      p_reply_content: replyContent.trim(),
    });

    if (error) {
      return { groupId: null, error: error.message };
    }
    return { groupId: data as string | null, error: null };
  } catch (err: any) {
    return { groupId: null, error: err.message || '网络请求错误，回复失败' };
  }
}


