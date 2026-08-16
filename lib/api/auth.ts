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
  pet_breed: string | null
  pet_level: number | null
  pet_xp: number | null
  pet_stage: 'child' | 'youth' | 'adult' | null
  pet_quota: number | null
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
    | 'edu_verified'
    | 'pet_name'
    | 'pet_avatar_url'
    | 'pet_bio'
    | 'pet_breed'
    | 'pet_stage'
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
// 传 userId   → 读别人（get_other_profile：真人 + 宠物完整，永不含
//               date_of_birth / personal_email / edu_email，只折算 age）
//
// 匿名场景（Pulse 接管前 / 群聊宠物身份）**不走这里** —— 那里用
// get_pet_identity 返回裸形态（种类 + 形态 + 会话内代号），见迁移 73。

export async function getProfile(userId?: string): Promise<Profile | null> {
  // 读自己：不要先 getUser()。那是一次网络校验，断网时会返回 no user，
  // 于是"网络不通"被当成"这个人不存在"，调用方一登出，用户就被无故踢下线。
  // RPC 本身走 auth.uid()，会话无效时它会报错，不需要额外的前置校验。
  if (!userId) {
    const { data, error } = await supabase.rpc('get_my_profile')
    // 抛 vs 返回 null 是有区别的，调用方靠这个区别决定要不要登出：
    //   抛出   = 没查成（网络 / 服务端故障）→ 该重试
    //   null   = 查成了，确实没有这一行（如数据库重置）→ 该登出
    if (error) throw new Error(`get_my_profile failed: ${error.message}`)
    return (data as Profile) ?? null
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (userId === session?.user?.id) {
    const { data, error } = await supabase.rpc('get_my_profile')
    if (error) throw new Error(`get_my_profile failed: ${error.message}`)
    return (data as Profile) ?? null
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
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return { error: 'Not authenticated' }

  // Filter out protected columns (like edu_verified) that trigger PostgreSQL 42501 permission denied
  const sanitizedFields: Record<string, any> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'edu_verified') continue // Protected column, updated via edge function / DB trigger
    if (value !== undefined) {
      sanitizedFields[key] = value
    }
  }

  // 1. Try update first on authenticated user's profile row
  const { error: updateErr } = await supabase
    .from('profiles')
    .update(sanitizedFields)
    .eq('id', user.id)

  if (!updateErr) return { error: null }

  // 2. Try upsert fallback if row does not exist yet
  const { error: upsertErr } = await supabase
    .from('profiles')
    .upsert({ id: user.id, ...sanitizedFields })

  if (!upsertErr) return { error: null }

  return { error: updateErr?.message || upsertErr?.message || 'Update failed' }
}

export async function deleteAccount(): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('delete_my_account')
  if (error) return { error: error.message }

  const signOutRes = await signOut()
  return { error: signOutRes.error }
}

