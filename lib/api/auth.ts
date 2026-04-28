import { supabase } from '../supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Profile {
  id: string
  sudo_id: string
  real_name: string | null
  bio: string | null
  avatar_url: string | null
  qr_code_url: string | null
  date_of_birth: string | null
  nationality: string | null
  region: string | null
  university: string | null
  personal_email: string | null
  personal_email_verified: boolean | null
  edu_email: string | null
  edu_verified: boolean
  pet_name: string | null
  pet_avatar_url: string | null
  pet_bio: string | null
  pet_level: number | null
  pet_xp: number | null
  identity_mode: 'real' | 'pet'
  location_sharing: 'precise' | 'fuzzy' | 'off' | null
  ranking_opt_in: boolean | null
  ranking_identity_mode: 'real' | 'pet' | null
  profile_visibility: 'real_only' | 'real_with_pet' | 'pet_only'
  show_date_of_birth: boolean
  show_nationality: boolean
  show_qr_code: boolean
  created_at: string
  // 从 explorations 联查（不在 profiles 表中）
  active_title: string | null
}

// Fields the user is allowed to update on themselves.
// Protected fields (edu_verified, pet_xp, pet_level, sudo_id,
// personal_email_verified, id, created_at) are intentionally omitted —
// those are written by Edge Functions or the add_xp() RPC only.
// Enforced at the database level by migration 55_protect_profile_columns.sql.
//
// NOTE: `university` IS editable by the user — they pick it from a list during
// onboarding / before email verification. Setting this column DOES NOT grant
// edu_verified; verification still requires offer screenshot AI match or .edu
// email domain verification (both server-side).
export type ProfileUpdate = Partial<
  Pick<
    Profile,
    | 'real_name'
    | 'bio'
    | 'avatar_url'
    | 'qr_code_url'
    | 'date_of_birth'
    | 'nationality'
    | 'region'
    | 'university'
    | 'personal_email'
    | 'edu_email'
    | 'pet_name'
    | 'pet_avatar_url'
    | 'pet_bio'
    | 'identity_mode'
    | 'location_sharing'
    | 'ranking_opt_in'
    | 'ranking_identity_mode'
    | 'profile_visibility'
    | 'show_date_of_birth'
    | 'show_nationality'
    | 'show_qr_code'
  >
>

// ─── Task 54: signUp ──────────────────────────────────────────────────────────

export async function signUp(
  email: string,
  password: string
): Promise<{ userId: string | null; error: string | null }> {
  const { data, error } = await supabase.auth.signUp({ email, password })

  if (error) return { userId: null, error: error.message }
  if (!data.user) return { userId: null, error: 'Sign up failed' }

  return { userId: data.user.id, error: null }
}

// ─── Task 54: signIn ──────────────────────────────────────────────────────────

export async function signIn(
  email: string,
  password: string
): Promise<{ userId: string | null; error: string | null }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) return { userId: null, error: error.message }
  if (!data.user) return { userId: null, error: 'Sign in failed' }

  return { userId: data.user.id, error: null }
}

// ─── Task 54: signOut ─────────────────────────────────────────────────────────

export async function signOut(): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signOut()
  return { error: error?.message ?? null }
}

// ─── Task 54: getProfile ──────────────────────────────────────────────────────
// 不传 userId → 读自己（完整数据，走 get_my_profile RPC）
// 传 userId   → 读别人（按对方隐私设置过滤，走 get_other_profile RPC）
//
// 隐私过滤逻辑全部搬到 DB 层的 SECURITY DEFINER 函数，避免被绕过。
// 受保护列（personal_email 等）在 profiles 表上已 REVOKE SELECT，直接查表会报错，
// 只能走这两个 RPC —— 见 migration 25 column-level privileges 节。

export async function getProfile(userId?: string): Promise<Profile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const isSelf = !userId || userId === user.id

  if (isSelf) {
    // Own profile — RPC returns full data (all fields)
    const { data, error } = await supabase.rpc('get_my_profile')
    if (error || !data) return null
    return data as Profile
  }

  // Other user — RPC applies privacy filter server-side
  const { data, error } = await supabase.rpc('get_other_profile', { target_id: userId })
  if (error || !data) return null

  // get_other_profile omits fields that are never visible to others.
  // Fill with null / false so the shape matches the Profile interface.
  return {
    ...(data as object),
    personal_email: null,
    personal_email_verified: null,
    edu_email: null,
    region: null,
    location_sharing: null,
    ranking_opt_in: null,
    ranking_identity_mode: null,
    show_date_of_birth: false,
    show_nationality: false,
    show_qr_code: false,
  } as Profile
}

// ─── Task 70: getMyTitles ─────────────────────────────────────────────────────
// 汇总当前用户所有 explorations 的 titles_earned，返回去重后的称号列表

export async function getMyTitles(): Promise<string[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('explorations')
    .select('titles_earned')
    .eq('user_id', user.id)

  if (!data) return []

  const all = data.flatMap((row) => row.titles_earned as string[])
  return [...new Set(all)]
}

// ─── Task 54: updateProfile ───────────────────────────────────────────────────

export async function updateProfile(
  fields: ProfileUpdate
): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('id', user.id)

  return { error: error?.message ?? null }
}
