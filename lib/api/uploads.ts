// ─── Chat media uploads (chat-media private bucket) ──────────────────────────
// Path convention: {conversationId}/{uid}_{timestamp}_{sanitizedName}
// RLS (migration 63) allows upload/read only to conversation members, so we
// store bucket *paths* in messages.attachments and resolve short-lived signed
// URLs at render time — media URLs never leak outside the conversation.

import { supabase } from '../supabase'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'

export type AttachmentKind = 'image' | 'file' | 'audio'

export interface Attachment {
  kind: AttachmentKind
  path: string        // storage path inside chat-media bucket
  name: string        // original filename (display)
  mime: string
  size: number        // bytes
  w?: number          // image width (optional, for bubble aspect ratio)
  h?: number
  sec?: number        // 语音时长（秒）。录的时候就知道，存下来省得播放前先解码
}

const BUCKET = 'chat-media'
const ROAM_BUCKET = 'roam-media'

/**
 * Size caps. These mirror `storage.buckets.file_size_limit` (migration 96) —
 * the bucket is the enforcement, this is only so the user gets a clear message
 * before we spend their bandwidth. Keep the two in sync.
 */
export const MAX_FILE_BYTES = 40 * 1024 * 1024
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024

/**
 * Attachment extensions we accept in chats. Enforced server-side by the
 * RESTRICTIVE storage policy in migration 96 — this list only keeps the picker
 * honest and lets us fail fast with a readable error.
 *
 * We judge by *extension*, not MIME: DocumentPicker frequently reports
 * `application/octet-stream` (or nothing) for code files on Android, and the
 * recipient's OS decides how to open a file by its extension anyway.
 *
 * Deliberately excluded — do not add without re-reading migration 96's header:
 *   executables  exe apk dmg msi jar bat sh ps1 cmd
 *   archives     zip rar 7z tar gz     (opaque — nothing inside can be checked)
 *   macro Office docm xlsm pptm
 *   scriptable   svg html htm
 */
export const ALLOWED_CHAT_EXTS = [
  // images
  'jpg', 'jpeg', 'png', 'webp', 'gif',
  // 语音消息（expo-audio 两端都产 m4a/AAC）。只加这一个 —— 我们自己不产出
  // mp3/wav，多一个扩展名就多一份能传进来的东西。服务端强制在迁移 102。
  'm4a',
  // documents
  'pdf', 'docx', 'xlsx', 'pptx', 'txt', 'md', 'csv', 'rtf',
  // legacy Office — professors still send these
  'doc', 'xls', 'ppt',
  // code / data
  'py', 'ipynb', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'java', 'kt', 'swift',
  'c', 'h', 'cpp', 'hpp', 'cc', 'cs', 'go', 'rs', 'rb', 'php', 'scala', 'sql',
  'json', 'xml', 'yml', 'yaml', 'toml', 'ini', 'css', 'scss', 'tex', 'r', 'm',
] as const

export const ALLOWED_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const

/** Lowercased extension without the dot, or '' when there isn't one. */
export function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name)
  return m ? m[1].toLowerCase() : ''
}

export function isAllowedChatFile(name: string): boolean {
  return (ALLOWED_CHAT_EXTS as readonly string[]).includes(extensionOf(name))
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
}

/**
 * Normalize a picked image before upload:
 * - re-encode to JPEG (iOS HEIC won't render on Android otherwise)
 * - cap longest side at 2048px (WeChat-style; saves storage/bandwidth)
 * - side effect: strips EXIF/GPS metadata (privacy win)
 */
export async function normalizeImage(
  uri: string,
  width?: number,
): Promise<{ uri: string; w: number; h: number }> {
  const actions = width && width > 2048 ? [{ resize: { width: 2048 } }] : []
  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
  })
  return { uri: result.uri, w: result.width, h: result.height }
}

// RN's Blob lacks arrayBuffer(); read the local file as base64 and decode to bytes.
async function readFileBytes(uri: string): Promise<Uint8Array> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any })
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * 删掉刚上传但决定不发的文件。
 *
 * 用在内容审核拦下来那一刻：文件已经在桶里，但还没有任何消息指向它。
 * 不删的话它就是一个谁都看不见、谁也删不掉、还一直占空间的孤儿 ——
 * 而且如果它是我们拦下来的那种东西，留着比删掉更糟。
 *
 * 失败只记日志不抛：删不掉是运维问题，不该让用户界面变成一个错误框。
 */
export async function removeChatMedia(paths: string[]): Promise<void> {
  if (!paths.length) return
  const { error } = await supabase.storage.from('chat-media').remove(paths)
  if (error) console.warn('removeChatMedia failed:', error.message, paths)
}

/** Upload one local file (uri) into the conversation's media folder. */
export async function uploadChatMedia(
  conversationId: string,
  uri: string,
  opts: { name: string; mime: string },
): Promise<{ path: string | null; size: number; error: string | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { path: null, size: 0, error: 'Not authenticated' }

    if (!isAllowedChatFile(opts.name)) {
      const ext = extensionOf(opts.name)
      return {
        path: null,
        size: 0,
        error: ext
          ? `.${ext} files can't be sent on zZuP!. You can send images, documents (pdf, docx, xlsx, pptx, txt, csv) and code files.`
          : `"${opts.name}" has no file extension, so we can't tell what it is.`,
      }
    }

    const bytes = await readFileBytes(uri)
    const size = bytes.byteLength
    const isImage = (ALLOWED_IMAGE_EXTS as readonly string[]).includes(extensionOf(opts.name))
    const cap = isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES
    if (size > cap) {
      return {
        path: null,
        size,
        error: `"${opts.name}" is ${formatBytes(size)} — over the ${cap / 1024 / 1024} MB limit.`,
      }
    }

    const path = `${conversationId}/${user.id}_${Date.now()}_${sanitizeName(opts.name)}`
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: opts.mime, upsert: false })

    if (error) return { path: null, size, error: error.message }
    return { path, size, error: null }
  } catch (e: any) {
    return { path: null, size: 0, error: e.message ?? 'Upload failed' }
  }
}

/** Resolve signed URLs (1h) for a batch of storage paths. Returns path->url map. */
export async function getSignedUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
  if (error || !data) return {}
  const map: Record<string, string> = {}
  data.forEach((d) => {
    if (d.signedUrl && d.path) map[d.path] = d.signedUrl
  })
  return map
}

// ─── Roam images (roam-media private bucket) ─────────────────────────────────
// Roam notes are broadcast to strangers, so this bucket is *images only* and
// its read policy is "any signed-in user, but only for objects an actual
// travel_post points at" (migration 96).
//
// We store the bucket *path* in travel_posts.image_url and sign a URL at render
// time, exactly like chat attachments. Before this, image_url held a URL the
// user typed by hand — which meant we could not moderate it (the far end can
// swap the file after we look at it) and every viewer leaked their IP to
// whoever owned that domain.
//
// Path convention: {uid}/{timestamp}_{sanitizedName}

/** Upload a picked image (already run through normalizeImage) for a Roam note. */
export async function uploadRoamImage(
  uri: string,
  opts: { name?: string } = {},
): Promise<{ path: string | null; error: string | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { path: null, error: 'Not authenticated' }

    const bytes = await readFileBytes(uri)
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return { path: null, error: `That image is ${formatBytes(bytes.byteLength)} — over the 20 MB limit.` }
    }

    // normalizeImage always hands back JPEG, so the extension is ours to set.
    const path = `${user.id}/${Date.now()}_${sanitizeName(opts.name ?? 'roam.jpg')}`
    const { error } = await supabase.storage
      .from(ROAM_BUCKET)
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: false })

    if (error) return { path: null, error: error.message }
    return { path, error: null }
  } catch (e: any) {
    return { path: null, error: e.message ?? 'Upload failed' }
  }
}

/**
 * Turn roam-media paths into signed URLs (1h). Values that already look like a
 * URL are passed through untouched, so anything created before migration 96
 * still renders instead of showing a broken image.
 */
export async function signRoamImages(paths: string[]): Promise<Record<string, string>> {
  const toSign = paths.filter((p) => p && !/^https?:\/\//i.test(p))
  if (toSign.length === 0) return {}
  const { data, error } = await supabase.storage.from(ROAM_BUCKET).createSignedUrls(toSign, 3600)
  if (error || !data) return {}
  const map: Record<string, string> = {}
  data.forEach((d) => {
    if (d.signedUrl && d.path) map[d.path] = d.signedUrl
  })
  return map
}

export function formatBytes(n: number): string {
  if (!n || n <= 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
