// ─── 举报 ─────────────────────────────────────────────────────────────────────
// 设计上的两个约束（迁移 71 里有完整说明）：
//
// 1. **客户端不传 user_id，只传 zzup_id / conversation_id**，由服务端解析成账号。
//    接口从第一天就不依赖"客户端知道对方是谁"，将来上不透明句柄时不用重做。
//
// 2. **举报记录只写不读。** 表里存着服务端解析出的被举报人身份，读回去就能把
//    宠物马甲和真人对上 —— 所以这里没有 getMyReports 之类的函数，是故意的。

import { supabase } from '../supabase'
import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'

export type ReportCategory =
  | 'harassment'
  | 'sexual_content'
  | 'violence'
  | 'spam'
  | 'impersonation'
  | 'underage'
  | 'self_harm'
  | 'other'

export const REPORT_CATEGORIES: { key: ReportCategory; label: string; hint: string }[] = [
  { key: 'harassment',     label: 'Harassment or bullying', hint: 'Insults, threats, repeated unwanted contact' },
  { key: 'sexual_content', label: 'Sexual content',         hint: 'Explicit content or sexual harassment' },
  { key: 'violence',       label: 'Violence or threats',    hint: 'Threats of harm, violent content' },
  { key: 'spam',           label: 'Spam or scam',           hint: 'Ads, phishing, fraud' },
  { key: 'impersonation',  label: 'Impersonation',          hint: 'Pretending to be someone else' },
  { key: 'underage',       label: 'Involves a minor',       hint: 'Content involving someone under 18' },
  { key: 'self_harm',      label: 'Concerned for someone',  hint: 'They may be at risk of hurting themselves' },
  { key: 'other',          label: 'Something else',         hint: '' },
]

const BUCKET = 'report-media'

export interface ReportAttachment {
  path: string
  name: string
  mime: string
  size: number
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
}

async function readFileBytes(uri: string): Promise<Uint8Array> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any })
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * 上传一张举报截图。
 * 路径首段必须是 uid —— storage 策略靠它限制只能写自己的目录（迁移 71）。
 */
export async function uploadReportImage(
  uri: string,
  width?: number,
): Promise<{ attachment: ReportAttachment | null; error: string | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { attachment: null, error: 'Not authenticated' }

    // 与聊天附件同样处理：转 JPEG、封顶 2048px、顺带剥掉 EXIF 定位信息
    const actions = width && width > 2048 ? [{ resize: { width: 2048 } }] : []
    const shrunk = await ImageManipulator.manipulateAsync(uri, actions, {
      compress: 0.8,
      format: ImageManipulator.SaveFormat.JPEG,
    })

    const bytes = await readFileBytes(shrunk.uri)
    const path = `${user.id}/${Date.now()}_${sanitizeName('screenshot.jpg')}`

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: false })

    if (error) return { attachment: null, error: error.message }

    return {
      attachment: { path, name: 'screenshot.jpg', mime: 'image/jpeg', size: bytes.byteLength },
      error: null,
    }
  } catch (e: any) {
    return { attachment: null, error: e?.message ?? 'Upload failed' }
  }
}

export async function submitReport(params: {
  category: ReportCategory
  description: string
  reportedZzupId?: string | null
  conversationId?: string | null
  reportedIdentity?: 'real' | 'pet' | null
  attachments?: ReportAttachment[]
}): Promise<{ reportId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('submit_report', {
    p_category: params.category,
    p_description: params.description,
    p_reported_zzup_id: params.reportedZzupId ?? null,
    p_conversation_id: params.conversationId ?? null,
    p_reported_identity: params.reportedIdentity ?? null,
    p_attachments: params.attachments ?? [],
    p_client_info: { platform: Platform.OS, os_version: String(Platform.Version) },
  })

  if (error) return { reportId: null, error: error.message }
  return { reportId: data as string, error: null }
}

/**
 * 举报匿名宠物。
 *
 * 只传「会话 + 会话内代号」—— 客户端**没有、也不需要**被举报人的身份标识。
 * 服务端自己把代号解析成账号，并把代号记进 context 顶层，
 * 运营处理时一眼能看出举的是哪一只（见迁移 80）。
 */
export async function submitReportByAlias(params: {
  conversationId: string
  alias: string
  category: ReportCategory
  description: string
  attachments?: ReportAttachment[]
}): Promise<{ reportId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('submit_report_by_alias', {
    p_conversation: params.conversationId,
    p_alias: params.alias,
    p_category: params.category,
    p_description: params.description,
    p_attachments: params.attachments ?? [],
    p_client_info: { platform: Platform.OS, os_version: String(Platform.Version) },
  })

  if (error) return { reportId: null, error: error.message }
  return { reportId: data as string, error: null }
}
