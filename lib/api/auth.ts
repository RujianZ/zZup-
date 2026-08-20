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
  // 迁移 90：false 时非好友无法**新建**与你的私聊（已存在的会话照常）。
  // 只有读自己（get_my_profile）才有值；读别人恒为 null —— 这是有意的，
  // 别人的设置可探测就等于把设置本身泄露出去。
  allow_stranger_dm: boolean | null
  notify_driftbottle: boolean | null
  notify_petchat: boolean | null
  notify_friend: boolean | null
  notify_dm: boolean | null
  notify_group: boolean | null
  // 条款同意（迁移 100）。时间戳是服务端盖的，三个版本号决定这条记录代表什么。
  // 只有 get_my_profile 会带回来；null = 从未同意过，这个账号发不出任何内容
  // （四张表上的 BEFORE INSERT 触发器挡着）。
  terms_accepted_at: string | null
  terms_version: string | null
  guidelines_version: string | null
  privacy_version: string | null
  // 封禁（迁移 107-109）。只有读自己（get_my_profile）才有值 ——
  // 读别人恒为 null，能读到就能扫出全站的封禁名单。
  account_status: 'active' | 'suspended' | 'banned' | null
  suspended_until: string | null
  enforcement_reason: string | null
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
    | 'allow_stranger_dm'
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
  if (error) {
    // 删过号的账号被 GoTrue 的 banned_until 挡在发令牌之前（迁移 103），
    // 但它回的是 "User is banned" —— 对删过号的人来说这话既像惩罚又看不懂。
    // **拦截是服务端做的，这里只负责把话说清楚**，改客户端绕不过去。
    if (/banned/i.test(error.message)) {
      return {
        userId: null,
        error: 'This account was deleted and can’t be used to sign in. Create a new account with a different email to start over.',
      }
    }
    return { userId: null, error: error.message }
  }
  if (!data.user) return { userId: null, error: 'Sign in failed' }
  return { userId: data.user.id, error: null }
}

/**
 * 登出。**服务端失败也一定要把人登出。**
 *
 * 默认的 signOut() 会打一次 /logout。如果这张会话在服务端已经不存在了
 * （删号会清 auth.sessions；管理员踢人、令牌过期同理），那一发是 500，
 * supabase-js 直接抛错、**本地会话原样留着** —— 表现是点了登出没反应，
 * 人卡在一个用不了的账号里出不来。
 *
 * 所以服务端那次失败了就退回 scope: 'local'：服务端本来就已经没有可撤销的
 * 东西了，清掉本地这份就是正确结果。
 */
export async function signOut(): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signOut()
  if (!error) return { error: null }

  const { error: localError } = await supabase.auth.signOut({ scope: 'local' })
  return { error: localError?.message ?? null }
}

/**
 * 发一封密码重置邮件。
 *
 * 用户点邮件里的链接后，Supabase 先验 token，再把带会话的 URL 重定向到
 * `redirectTo` —— 也就是 zzup.org 上那个重置页，改密码发生在**网页上**，
 * 所以 App 这边不需要「输入新密码」的界面，只需要触发这一步。
 * 改完之后用新密码走正常登录流程即可。
 *
 * ⚠️ redirectTo 必须出现在 Supabase 后台的
 *    Authentication → URL Configuration → Redirect URLs 白名单里，
 *    否则 Supabase 会忽略它、退回 Site URL，用户就落到首页什么也改不了。
 *
 * 无论邮箱存不存在，Supabase 都返回成功 —— 这是它防「拿接口探测哪些邮箱注册过」
 * 的设计。所以 UI 文案不能写「已发送」，要写「如果这个邮箱注册过，就会收到」。
 */
export async function sendPasswordReset(email: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: 'https://zzup.org/reset-password',
  })
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
    // 读别人时恒为 null。get_other_profile 故意不返回它 ——
    // 能读到就能扫出谁开了谁没开，那等于把这个设置本身泄露掉。
    allow_stranger_dm: null,
    account_status: null,
    suspended_until: null,
    enforcement_reason: null,
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

  // ── 内容审核：陌生人看得见的四个字段 ────────────────────────────────
  //
  // 为什么在这里而不是在界面里：updateProfile 是所有资料写入的**唯一咽喉点**，
  // Profile 的编辑和 Onboarding 的两步都走它。挂在界面上就会漏。
  //
  // 为什么这四个字段要审：真名 / 简介 / 宠物名 / 宠物简介**陌生人都看得见**
  // （搜索、Roam、Pulse），按苹果 1.2 的口径它们是 "posted"，跟私聊不是一回事。
  //
  // ⚠️ 调用失败 = 放行。我们什么都没学到，就没有知情，也就没有义务
  //    （18 U.S.C. §2258A(f)）。宁可漏，不要把 OpenAI 抖一下变成用户改不了资料。
  const moderated = ['real_name', 'bio', 'pet_name', 'pet_bio']
    .map((k) => sanitizedFields[k])
    .filter((v) => typeof v === 'string' && v.trim().length > 0)
    .join(' \n ')

  if (moderated) {
    try {
      const { data: verdict, error: modError } = await supabase.functions.invoke('moderate-content', {
        body: { surface: 'profile', text: moderated },
      })
      if (!modError && verdict && verdict.allowed === false) {
        // **不告诉他命中了哪一类。** 说了就是在教他怎么改到刚好绕过去。
        return {
          error: 'This doesn’t fit our Community Guidelines. Please edit it and try again.',
        }
      }
    } catch {
      // 同上：审核跑不了就放行
    }
  }

  // `.eq('id', ...)` 看着只是个筛选，但 Postgres 里 **UPDATE ... WHERE 也需要
  // WHERE 引用列的 SELECT 权限**。迁移 79 逐列撤销 SELECT 之后这里整个失效，
  // 表现是新用户填完资料保存失败、卡在 onboarding 出不去。
  // 迁移 89 把 `id` 一列还了回去（只有这一列，敏感列仍然读不到）。
  const { error } = await supabase
    .from('profiles')
    .update(sanitizedFields)
    .eq('id', user.id)

  // 这里原来还有一段 upsert 兜底，注释写着「万一行还不存在」。
  // 但 auth.users 上的 on_auth_user_created 触发器在注册那一刻就把 profile 建好了，
  // 行不可能不存在 —— 而且 ON CONFLICT DO UPDATE 需要更多 SELECT 权限，
  // 真走到那一步只会换一个 42501。已删除。
  return { error: error?.message ?? null }
}

export async function deleteAccount(): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('delete_my_account')
  if (error) return { error: error.message }

  // **必须是 local**。迁移 103 之后 delete_my_account() 会把 auth.sessions 里
  // 这个人的会话删掉，所以等这个函数返回时，服务端已经不认识手上这张令牌了。
  // 默认的 signOut() 要打一次 /logout，那一发必然 500 —— 实测下来用户会看到
  // 「Unexpected failure, please check server logs」，而且**没被登出**，
  // 顶着一个已删除的账号继续待在 App 里。号删成功了，界面上却像是失败了。
  //
  // scope: 'local' 只清本地存的会话，不打服务端 —— 服务端那边已经清干净了。
  const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
  return { error: signOutError?.message ?? null }
}

