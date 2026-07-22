import { supabase } from '../supabase';

export interface MatchQueueStatus {
  id: string;
  user_id: string;
  joined_at: string;
  status: 'waiting' | 'matched' | 'cancelled';
  matched_group_id: string | null;
}

/**
 * 发起同频匹配 (加入等待队列)
 */
export async function startMatching(preMatchIntent?: string): Promise<{ status: 'waiting' | 'matched'; groupId?: string; error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('agent-chat', {
      body: { action: 'join_match', pre_match_intent: preMatchIntent || '' },
    });

    if (error) return { status: 'waiting', error: error.message || 'Failed to start matching' };
    if (data?.error) return { status: 'waiting', error: data.error };

    return {
      status: data.status,
      groupId: data.groupId,
      error: null
    };
  } catch (err: any) {
    return { status: 'waiting', error: err.message || 'Network error during matching' };
  }
}

/**
 * 取消同频匹配 (退出等待队列)
 */
export async function cancelMatching(): Promise<{ success: boolean; error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('agent-chat', {
      body: { action: 'cancel_match' },
    });

    if (error) return { success: false, error: error.message || 'Failed to cancel matching' };
    if (data?.error) return { success: false, error: data.error };

    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error cancelling match' };
  }
}

/**
 * 订阅匹配结果
 * @param userId 当前用户ID
 * @param onMatchFound 匹配成功回调，参数为 matched_group_id
 */
export function subscribeToMatchResult(
  userId: string,
  onMatchFound: (groupId: string) => void
): () => void {
  const channel = supabase
    .channel(`match_queue:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'match_queue',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        const newRecord = payload.new as MatchQueueStatus;
        if (newRecord.status === 'matched' && newRecord.matched_group_id) {
          onMatchFound(newRecord.matched_group_id);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
