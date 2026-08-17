import { supabase } from '../supabase';
import { signRoamImages } from './uploads';

/**
 * travel_posts.image_url holds a **roam-media bucket path**, not a URL
 * (migration 96). Swap the paths for short-lived signed URLs here so every
 * screen can keep rendering `post.image_url` directly. Anything that already
 * looks like a URL is left alone.
 */
async function resolveImageUrls<T extends { image_url: string | null }>(posts: T[]): Promise<T[]> {
  const paths = posts.map((p) => p.image_url).filter((u): u is string => !!u);
  if (paths.length === 0) return posts;
  const signed = await signRoamImages(paths);
  if (Object.keys(signed).length === 0) return posts;
  return posts.map((p) =>
    p.image_url && signed[p.image_url] ? { ...p, image_url: signed[p.image_url] } : p,
  );
}

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
 *
 * imagePath 是 **roam-media 桶里的路径**（迁移 96），不再是外链。
 *
 * ⚠️ travel-mode Edge Function（Ethan 的）里有一段：
 *      if (image_url && image_url.startsWith("http")) { …gpt-4o-mini vision… }
 *    传路径进去这一段会静默跳过，Roam 的 embedding 退回纯文本。
 *    影响仅限「图片不参与匹配」——content 是必填的，文本 embedding 照常。
 *    他那边加一个「路径就先 signed URL 再送 vision」的分支即可恢复，
 *    我们这边不用改。改这里之前先看 docs/_local/ 的排查文档。
 */
export async function createTravelPost(
  content: string,
  imagePath?: string,
  audioUrl?: string,
  durationHours: number = 6
): Promise<{ post: TravelPost | null; error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('travel-mode', {
      body: {
        action: 'create',
        content,
        image_url: imagePath,
        audio_url: audioUrl,
        duration_hours: durationHours
      },
    });

    if (error) return { post: null, error: error.message || 'Failed to start travel' };
    if (data?.error) return { post: null, error: data.error };

    // The edge function echoes back the row as inserted, so image_url is still a
    // bucket path here. Sign it like the read paths do, or the composer renders
    // a broken image until the screen is reloaded.
    const [resolved] = await resolveImageUrls([data.post as TravelPost]);
    return { post: resolved, error: null };
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

    return { posts: await resolveImageUrls(data.posts || []), error: null };
  } catch (err: any) {
    return { posts: [], error: err.message || 'Network error fetching travel posts' };
  }
}

/**
 * 浏览旅行帖子 (增加阅读量)
 */
// incrementTravelPostView() 删于 2026-08-18。它调的 `increment_travel_post_view`
// 在数据库里根本不存在，每次打开 Roam 详情都静默失败一次（被 .catch 吞掉）。
// 浏览数一直是 NearbyTravelScreen 点卡片时调 recordTravelPostView 记录的，
// 详情页那次是重复调用 —— 所以是删掉，不是改指向真函数（那会变成计数 +2）。

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
        const [resolved] = await resolveImageUrls([singlePost as TravelPost]);
        return { post: resolved, error: null };
      }
      return { post: null, error: null };
    }

    if (typeof data === 'object') {
      if (!data.id || !data.ends_at) {
        return { post: null, error: null };
      }
      const [resolved] = await resolveImageUrls([data as TravelPost]);
      return { post: resolved, error: null };
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
  // 必须走 RPC：原来的 PostgREST 内嵌联查依赖 profiles 的列级 SELECT 授权，
  // 而那些授权在迁移 79 里整体撤销了。
  //
  // 顺带修正显示身份：Roam 是**真人发帖**（宠物只充当跑腿的趣味角色），
  // 所以留言作者显示真名。原来是 `pet_name || real_name`，把真人留言
  // 显示成了宠物名。
  const { data, error } = await supabase.rpc('list_travel_comments', { p_post: postId });

  if (error) return { comments: [], error: error.message };

  const formatted: TravelComment[] = ((data ?? []) as any[]).map((c: any) => ({
    id: c.id,
    travel_post_id: c.travel_post_id,
    author_id: c.author_id,
    content: c.content,
    created_at: c.created_at,
    author_name: c.author_name || 'zZuPer',
    author_avatar_url: c.author_avatar_url || null,
  }));

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

// createTemporaryDirectMessage 已删除（2026-08-15）。
//
// 三个理由，任何一个都足够：
//   1. **零调用者** —— 全仓库没有一处引用
//   2. **跑不通** —— 它直接 insert conversations，被 RLS 拒（42501）。
//      与「写只走 RPC」的约定冲突
//   3. **逻辑上就不成立** —— 它靠查对方的 conversation_members 来找已有会话，
//      但 RLS 只让你看见自己那一行，那个查询永远返回空
//
// 真要做「临时直聊」，照 reply_to_travel_comment 那样写个 SECURITY DEFINER RPC。

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


