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
  personal_email_verified: boolean
  edu_email: string | null
  edu_verified: boolean
  pet_name: string | null
  pet_avatar_url: string | null
  pet_bio: string | null
  pet_level: number
  pet_xp: number
  identity_mode: 'real' | 'pet'
  location_sharing: 'precise' | 'fuzzy' | 'off'
  ranking_opt_in: boolean
  ranking_identity_mode: 'real' | 'pet'
  created_at: string
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

export async function getProfile(): Promise<Profile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return data as Profile | null
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
