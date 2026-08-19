import { supabase } from '../supabase'
import { DOC_VERSIONS } from '../legal/documents.generated'
import type { Profile } from './auth'

/**
 * 条款同意。
 *
 * 时间戳由**服务端**盖（迁移 100 的 `accept_terms` RPC），客户端连传都不传 ——
 * 否则理论上可以伪造一个「我 2020 年就同意了」。版本号是唯一的入参，它决定了
 * 这条记录到底代表什么。
 *
 * ⚠️ 客户端这一层只是界面。真正拦人的是 `messages` / `travel_posts` /
 * `travel_comments` / `match_queue` 上的 BEFORE INSERT 触发器 —— 没有同意记录
 * 就写不进去，改客户端或者直接打 REST 接口都绕不过。
 */
export async function acceptTerms(): Promise<{ acceptedAt: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('accept_terms', {
    p_terms_version: DOC_VERSIONS.terms,
    p_guidelines_version: DOC_VERSIONS.guidelines,
    p_privacy_version: DOC_VERSIONS.privacy,
  })

  // RLS / 触发器拦下来的时候 data 是 null 而 error 有值 —— 一定要看 error，
  // 不能只看 data（LESSONS：RLS 拦截返回的是空，不是异常）
  if (error) return { acceptedAt: null, error: error.message }
  return { acceptedAt: (data as string) ?? null, error: null }
}

/**
 * 这个人还需不需要过同意屏。
 *
 * 三种情况都要拦：从来没同意过、任何一份文书的版本对不上（说明我们改过文书）、
 * 以及资料还没加载出来时保守地当作「需要」。
 */
export function needsConsent(profile: Profile | null): boolean {
  if (!profile) return false // 资料没到，交给上层的 Splash 处理，别在这里误判
  if (!profile.terms_accepted_at) return true
  return (
    profile.terms_version !== DOC_VERSIONS.terms ||
    profile.guidelines_version !== DOC_VERSIONS.guidelines ||
    profile.privacy_version !== DOC_VERSIONS.privacy
  )
}
