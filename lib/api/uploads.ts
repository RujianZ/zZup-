// ─── Chat media uploads (chat-media private bucket) ──────────────────────────
// Path convention: {conversationId}/{uid}_{timestamp}_{sanitizedName}
// RLS (migration 63) allows upload/read only to conversation members, so we
// store bucket *paths* in messages.attachments and resolve short-lived signed
// URLs at render time — media URLs never leak outside the conversation.

import { supabase } from '../supabase'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'

export type AttachmentKind = 'image' | 'file'

export interface Attachment {
  kind: AttachmentKind
  path: string        // storage path inside chat-media bucket
  name: string        // original filename (display)
  mime: string
  size: number        // bytes
  w?: number          // image width (optional, for bubble aspect ratio)
  h?: number
}

const BUCKET = 'chat-media'

/** Supabase project-wide per-file upload cap (Free plan hard limit). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024

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

/** Upload one local file (uri) into the conversation's media folder. */
export async function uploadChatMedia(
  conversationId: string,
  uri: string,
  opts: { name: string; mime: string },
): Promise<{ path: string | null; size: number; error: string | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { path: null, size: 0, error: 'Not authenticated' }

    const bytes = await readFileBytes(uri)
    const size = bytes.byteLength
    if (size > MAX_FILE_BYTES) {
      return { path: null, size, error: `"${opts.name}" is larger than the 50 MB limit (${formatBytes(size)}).` }
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

export function formatBytes(n: number): string {
  if (!n || n <= 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
