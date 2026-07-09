import { supabase } from '../supabase'

// ─── XP Constants ─────────────────────────────────────────────────────────────
// 宠物经验规则集中在这里（聊天养成）。posts/comments/exploration 系树外已删。

export const MESSAGE_THRESHOLD = 20 // messages per day needed to earn XP
export const MESSAGE_XP = 10        // XP for hitting the daily message threshold

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getTodayStart(): string {
  // 使用 Intl.DateTimeFormat 安全提取洛杉矶时区的年、月、日，避免 Hermes 引擎下 Date 字符串解析的兼容性 bug
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find(p => p.type === 'year')?.value || '1970';
  const month = parts.find(p => p.type === 'month')?.value || '01';
  const day = parts.find(p => p.type === 'day')?.value || '01';
  return `${year}-${month}-${day}T00:00:00.000Z`;
}

export async function addXP(userId: string, xp: number): Promise<void> {
  // 原子自增：pet_xp / pet_level / pet_stage 在 add_xp RPC 内一步完成，避免并发竞态
  await supabase.rpc('add_xp', { p_user_id: userId, p_xp: xp })
}
