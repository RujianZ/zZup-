import { supabase } from '../supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
// 字段对齐 v3 profiles（见 25_user_profile_table.sql）。
// 红线：date_of_birth / personal_email 永不对外（看别人时只给 age）。

export interface Profile {
  id: string
  zzup_id: string
  // 真人身份
  real_name: string | null
  bio: string | null
  avatar_url: string | null
  qr_code_url: string | null
  date_of_birth: string | null
  age: number | null
  gender: 'male' | 'female' | 'nonbinary' | 'undisclosed' | null
  nationality: string | null
  university: string | null
  personal_email: string | null
  personal_email_verified: boolean | null
  edu_email: string | null
  edu_verified: boolean
  // 宠物身份
  pet_name: string | null
  pet_avatar_url: string | null
  pet_bio: string | null
  pet_level: number | null
  pet_xp: number | null
  pet_stage: 'child' | 'youth' | 'adult' | null
  pet_quota: number | null
  // S_A 展示身份
  profile_visibility: 'real_only' | 'real_with_pet' | 'pet_only'
  // 隐私 / 加好友途径 / 通知开关
  searchable_by_real_name: boolean | null
  allow_add_via_search: boolean | null
  allow_add_via_qr: boolean | null
  allow_add_via_profile: boolean | null
  notify_driftbottle: boolean | null
  notify_petchat: boolean | null
  notify_friend: boolean | null
  notify_dm: boolean | null
  notify_group: boolean | null
  // 生命周期
  onboarded: boolean
  deleted_at: string | null
  created_at: string
}

// 用户可自改字段（受保护列：zzup_id / *_verified / pet_xp/level/stage / deleted_at
// / id / created_at 由 RPC / Edge Function 写，见 25 列级权限）。
export type ProfileUpdate = Partial<
  Pick<
    Profile,
    | 'real_name'
    | 'bio'
    | 'avatar_url'
    | 'qr_code_url'
    | 'date_of_birth'
    | 'gender'
    | 'nationality'
    | 'university'
    | 'personal_email'
    | 'edu_email'
    | 'pet_name'
    | 'pet_avatar_url'
    | 'pet_bio'
    | 'profile_visibility'
    | 'searchable_by_real_name'
    | 'allow_add_via_search'
    | 'allow_add_via_qr'
    | 'allow_add_via_profile'
    | 'notify_driftbottle'
    | 'notify_petchat'
    | 'notify_friend'
    | 'notify_dm'
    | 'notify_group'
    | 'onboarded'
  >
>

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function signUp(
  email: string,
  password: string
): Promise<{ userId: string | null; error: string | null }> {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return { userId: null, error: error.message }
  if (!data.user) return { userId: null, error: 'Sign up failed' }
  return { userId: data.user.id, error: null }
}

export async function signIn(
  email: string,
  password: string
): Promise<{ userId: string | null; error: string | null }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { userId: null, error: error.message }
  if (!data.user) return { userId: null, error: 'Sign in failed' }
  return { userId: data.user.id, error: null }
}

export async function signOut(): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signOut()
  return { error: error?.message ?? null }
}

// ─── Profile ──────────────────────────────────────────────────────────────────
// 不传 userId → 读自己（get_my_profile，全字段）
// 传 userId   → 读别人（get_other_profile，按对方 S_A 过滤，永不含敏感列）
// 隐私过滤全在 DB 层 SECURITY DEFINER RPC，客户端绕不过。

export async function getProfile(userId?: string): Promise<Profile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const isSelf = !userId || userId === user.id

  if (isSelf) {
    const { data, error } = await supabase.rpc('get_my_profile')
    if (error || !data) return null
    return data as Profile
  }

  const { data, error } = await supabase.rpc('get_other_profile', { target_id: userId })
  if (error || !data) return null

  // get_other_profile 省略了永不对外的字段，补成 Profile 形状
  return {
    date_of_birth: null,
    personal_email: null,
    personal_email_verified: null,
    edu_email: null,
    pet_xp: null,
    pet_quota: null,
    searchable_by_real_name: null,
    allow_add_via_search: null,
    allow_add_via_qr: null,
    allow_add_via_profile: null,
    notify_driftbottle: null,
    notify_petchat: null,
    notify_friend: null,
    notify_dm: null,
    notify_group: null,
    onboarded: false,
    deleted_at: null,
    ...(data as object),
  } as Profile
}

export async function updateProfile(
  fields: ProfileUpdate
): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase.from('profiles').update(fields).eq('id', user.id)
  return { error: error?.message ?? null }
}
