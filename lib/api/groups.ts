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

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function syncMembersCount(groupId: string): Promise<void> {
  const { count } = await supabase
    .from('group_members')
    .select('*', { count: 'exact', head: true })
    .eq('group_id', groupId)
  await supabase
    .from('groups')
    .update({ members_count: count ?? 0 })
    .eq('id', groupId)
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

  await supabase.from('groups').update({ members_count: 1 }).eq('id', group.id)

  return { ...group, members_count: 1 } as Group
}

// ─── Task 72: getMyGroups ─────────────────────────────────────────────────────

export async function getMyGroups(): Promise<Group[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data: memberships } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', user.id)

  if (!memberships || memberships.length === 0) return []

  const groupIds = memberships.map((m) => m.group_id)

  const { data } = await supabase.from('groups').select('*').in('id', groupIds)

  return (data ?? []) as Group[]
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

  await syncMembersCount(groupId)
  return { error: null }
}

// ─── Task 74: leaveGroup ──────────────────────────────────────────────────────

export async function leaveGroup(groupId: string): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: group } = await supabase
    .from('groups')
    .select('created_by')
    .eq('id', groupId)
    .single()

  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  // If the creator is leaving, transfer ownership to the longest-standing remaining member
  if (group?.created_by === user.id) {
    const { data: nextMember } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true })
      .limit(1)
      .single()

    await supabase
      .from('groups')
      .update({ created_by: nextMember?.user_id ?? null })
      .eq('id', groupId)
  }

  await syncMembersCount(groupId)
  return { error: null }
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

  // Check if a direct conversation already exists between these two users
  const { data: myDirectGroups } = await supabase
    .from('group_members')
    .select('group_id, groups!inner(id, chat_type)')
    .eq('user_id', user.id)
    .eq('groups.chat_type', 'direct')

  if (myDirectGroups) {
    for (const row of myDirectGroups as any[]) {
      const { data: match } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', row.group_id)
        .eq('user_id', friendId)
        .single()

      if (match) {
        const { data: existing } = await supabase
          .from('groups')
          .select('*')
          .eq('id', row.group_id)
          .single()
        return existing as Group
      }
    }
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
      members_count: 2,
    })
    .select()
    .single()

  if (error || !group) return null

  await supabase.from('group_members').insert([
    { group_id: group.id, user_id: user.id, role: 'member' },
    { group_id: group.id, user_id: friendId, role: 'member' },
  ])

  return group as Group
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

  await syncMembersCount(groupId)
  return { error: null }
}
