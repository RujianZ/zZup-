import { supabase } from '../supabase'

// ─── XP Constants ─────────────────────────────────────────────────────────────
// All XP rules live here — change these numbers to rebalance the system

export const POST_XP = 5                  // XP per post created
export const COMMENT_XP = 3              // XP per comment created
export const POST_COMMENT_DAILY_CAP = 20 // max XP per day from posts + comments combined
export const MESSAGE_THRESHOLD = 20      // messages per day needed to earn XP
export const MESSAGE_XP = 10            // XP for hitting the daily message threshold
export const FOREGROUND_XP_PER_HOUR = 5 // XP per hour of foreground app usage

export const EXPLORATION_XP: Record<string, number> = {
  library:     15,
  gym:         15,
  coffee_shop: 10,
  dining:      10,
  other:       8,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getTodayStart(): string {
  // Use PT (America/Los_Angeles) so the daily cap resets at midnight PT
  // consistent with the weekly ranking reset in location.ts
  const now = new Date()
  const ptNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
  ptNow.setHours(0, 0, 0, 0)
  const y = ptNow.getFullYear()
  const m = String(ptNow.getMonth() + 1).padStart(2, '0')
  const d = String(ptNow.getDate()).padStart(2, '0')
  return new Date(`${y}-${m}-${d}T00:00:00.000Z`).toISOString()
}

export async function addXP(userId: string, xp: number): Promise<void> {
  // 原子自增：pet_xp 和 pet_level 在数据库内一步完成，避免并发竞态
  await supabase.rpc('add_xp', { p_user_id: userId, p_xp: xp })
}
