import { supabase } from '../supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Group {
  id: string
  name: string
  description: string | null
  avatar_url: string | null
  chat_type: 'group' | 'direct'
  group_type: 'official' | 'edu_verified' | 'open' | 'direct'
  university: string | null
  is_searchable: boolean
  created_by: string | null
  members_count: number
  created_at: string
}

export interface CreateGroupData {
  name: string
  description?: string
  avatar_url?: string
  group_type: 'official' | 'edu_verified' | 'open'
  university?: string
  is_searchable?: boolean
}

// ─── Task 71: createGroup ─────────────────────────────────────────────────────

export async function createGroup(data: CreateGroupData): Promise<Group | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: group, error } = await supabase
    .from('groups')
    .insert({
      name: data.name,
      description: data.description ?? null,
      avatar_url: data.avatar_url ?? null,
      chat_type: 'group',
      group_type: data.group_type,
      university: data.university ?? null,
      is_searchable: data.is_searchable ?? true,
      created_by: user.id,
      members_count: 0,
    })
    .select()
    .single()

  if (error || !group) return null

  await supabase.from('group_members').insert({
    group_id: group.id,
    user_id: user.id,
    role: 'admin',
  })

  // members_count 由 DB trigger on_group_member_insert 自动维护
  return { ...group, members_count: 1 } as Group
}

// ─── Task 72: getMyGroups ─────────────────────────────────────────────────────

export async function getMyGroups(): Promise<Group[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('group_members')
    .select('groups(*)')
    .eq('user_id', user.id)

  return (data ?? []).map((m: any) => m.groups).filter(Boolean) as Group[]
}

// ─── Task 73: joinGroup ───────────────────────────────────────────────────────

export async function joinGroup(groupId: string): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase.from('group_members').insert({
    group_id: groupId,
    user_id: user.id,
    role: 'member',
  })

  if (error) return { error: error.message }

  // members_count 由 DB trigger on_group_member_insert 自动维护
  return { error: null }
}

// ─── Task 74: leaveGroup ──────────────────────────────────────────────────────
// Atomic via DB RPC: deletes group_members row + auto-transfers ownership
// to oldest remaining member if leaver was the creator.
// Replaces previous JS implementation which silently failed on the
// ownership-transfer UPDATE due to RLS WITH CHECK.

export async function leaveGroup(groupId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('leave_group', { p_group_id: groupId })
  return { error: error?.message ?? null }
}

// ─── transferGroupOwnership ───────────────────────────────────────────────────
// Explicit ownership transfer by current creator to another member.
// New owner must already be a member of the group.

export async function transferGroupOwnership(
  groupId: string,
  newOwnerId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('transfer_group_ownership', {
    p_group_id: groupId,
    p_new_owner_id: newOwnerId,
  })
  return { error: error?.message ?? null }
}

// ─── Task 75: searchGroups ────────────────────────────────────────────────────

export async function searchGroups(keyword: string, university?: string): Promise<Group[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  // RLS already restricts edu_verified groups to the user's own university
  let query = supabase
    .from('groups')
    .select('*')
    .eq('is_searchable', true)
    .eq('chat_type', 'group')
    .gte('members_count', 3)
    .in('group_type', ['open', 'official', 'edu_verified'])
    .ilike('name', `%${keyword}%`)

  if (university) {
    query = query.or(`group_type.in.(open,official),and(group_type.eq.edu_verified,university.eq.${university})`)
  }

  const { data } = await query
  return (data ?? []) as Group[]
}

// ─── Task 76: createDirectMessage ────────────────────────────────────────────

export async function createDirectMessage(friendId: string): Promise<Group | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // TD-7: 用两个并行查询替代 N+1 循环，找到双方共同的 DM group
  const [{ data: myDMs }, { data: theirDMs }] = await Promise.all([
    supabase
      .from('group_members')
      .select('group_id, groups!inner(chat_type)')
      .eq('user_id', user.id)
      .eq('groups.chat_type', 'direct'),
    supabase
      .from('group_members')
      .select('group_id, groups!inner(chat_type)')
      .eq('user_id', friendId)
      .eq('groups.chat_type', 'direct'),
  ])

  const myDMIds = new Set((myDMs ?? []).map((r: any) => r.group_id))
  const sharedGroupId = (theirDMs ?? []).find((r: any) => myDMIds.has(r.group_id))?.group_id

  if (sharedGroupId) {
    const { data: existing } = await supabase
      .from('groups')
      .select('*')
      .eq('id', sharedGroupId)
      .single()
    return existing as Group
  }

  // Create new direct message conversation
  const { data: group, error } = await supabase
    .from('groups')
    .insert({
      name: '',
      chat_type: 'direct',
      group_type: 'direct',
      is_searchable: false,
      created_by: user.id,
      members_count: 0,
    })
    .select()
    .single()

  if (error || !group) return null

  await supabase.from('group_members').insert([
    { group_id: group.id, user_id: user.id, role: 'member' },
    { group_id: group.id, user_id: friendId, role: 'member' },
  ])

  // members_count 由 DB trigger 维护，返回时手动修正为 2 供前端立即使用
  return { ...group, members_count: 2 } as Group
}

// ─── Task 85: removeMember ────────────────────────────────────────────────────

export async function removeMember(
  groupId: string,
  targetUserId: string
): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: group } = await supabase
    .from('groups')
    .select('created_by')
    .eq('id', groupId)
    .single()

  if (group?.created_by !== user.id) return { error: 'Permission denied' }
  if (targetUserId === user.id) return { error: 'Cannot remove yourself' }

  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', targetUserId)

  if (error) return { error: error.message }

  // members_count 由 DB trigger on_group_member_delete 自动维护
  return { error: null }
}
