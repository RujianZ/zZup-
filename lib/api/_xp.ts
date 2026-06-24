import { supabase } from '../supabase'

// ─── XP Constants ─────────────────────────────────────────────────────────────
// 宠物经验规则集中在这里（聊天养成）。posts/comments/exploration 系树外已删。

export const MESSAGE_THRESHOLD = 20 // messages per day needed to earn XP
export const MESSAGE_XP = 10        // XP for hitting the daily message threshold

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getTodayStart(): string {
  // Use PT (America/Los_Angeles) so the daily cap resets at midnight PT
  const now = new Date()
  const ptNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
  ptNow.setHours(0, 0, 0, 0)
  const y = ptNow.getFullYear()
  const m = String(ptNow.getMonth() + 1).padStart(2, '0')
  const d = String(ptNow.getDate()).padStart(2, '0')
  return new Date(`${y}-${m}-${d}T00:00:00.000Z`).toISOString()
}

export async function addXP(userId: string, xp: number): Promise<void> {
  // 原子自增：pet_xp / pet_level / pet_stage 在 add_xp RPC 内一步完成，避免并发竞态
  await supabase.rpc('add_xp', { p_user_id: userId, p_xp: xp })
}
