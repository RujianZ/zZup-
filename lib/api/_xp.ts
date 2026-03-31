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
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export async function addXP(userId: string, xp: number): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('pet_xp, pet_level')
    .eq('id', userId)
    .single()
  if (!profile) return
  const newXP = (profile.pet_xp ?? 0) + xp
  const newLevel = Math.floor(newXP / 100) + 1
  await supabase
    .from('profiles')
    .update({ pet_xp: newXP, pet_level: newLevel })
    .eq('id', userId)
}
