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

export type ProfileUpdate = Partial<
  Pick<
    Profile,
    | 'real_name'
    | 'bio'
    | 'avatar_url'
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
// 不传 userId → 读自己（完整数据）
// 传 userId   → 读别人（按对方的隐私设置过滤）

export async function getProfile(userId?: string): Promise<Profile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const targetId = userId ?? user.id
  const isSelf = targetId === user.id

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', targetId)
    .single()

  if (!data) return null

  // 查当前装备称号（explorations 表，取唯一的非 null active_title）
  const { data: titleData } = await supabase
    .from('explorations')
    .select('active_title')
    .eq('user_id', targetId)
    .not('active_title', 'is', null)
    .limit(1)
    .maybeSingle()
  const activeTitle = titleData?.active_title ?? null

  // 自己：返回完整数据
  if (isSelf) return { ...data, active_title: activeTitle } as Profile

  // 别人：按隐私设置过滤
  const p = data as Profile

  const result: Profile = {
    ...p,
    active_title: activeTitle,
    // 永远隐藏的私密字段
    personal_email: null,
    personal_email_verified: null,
    edu_email: null,
    region: null,
    location_sharing: null,
    ranking_opt_in: null,
    ranking_identity_mode: null,
    // 用户自选是否公开的字段
    date_of_birth: p.show_date_of_birth ? p.date_of_birth : null,
    nationality: p.show_nationality ? p.nationality : null,
    qr_code_url: p.show_qr_code ? p.qr_code_url : null,
  }

  // 按 profile_visibility 决定显示哪个身份
  switch (p.profile_visibility) {
    case 'real_only':
      result.pet_name = null
      result.pet_avatar_url = null
      result.pet_bio = null
      result.pet_level = null
      result.pet_xp = null
      break
    case 'pet_only':
      result.real_name = null
      result.avatar_url = null
      result.bio = null
      result.university = null
      // TD-4: 生日/国籍/二维码属于真人身份，pet_only 时一并隐藏
      result.date_of_birth = null
      result.nationality = null
      result.qr_code_url = null
      break
    case 'real_with_pet':
      break
  }

  // TD-5: 隐私设置本身不对外暴露，对方只看到过滤后的结果
  result.show_date_of_birth = false
  result.show_nationality = false
  result.show_qr_code = false

  return result
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
