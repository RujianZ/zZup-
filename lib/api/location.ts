import { supabase } from '../supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export type LocationSharingMode = 'precise' | 'fuzzy' | 'off'

export interface Coordinate {
  latitude: number
  longitude: number
}

export interface FriendLocation {
  user_id: string
  latitude: number
  longitude: number
  updated_at: string
  display_name: string
  avatar_url: string | null
  pet_avatar_url: string | null
  identity_mode: 'real' | 'pet'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Apply ±500m random offset for fuzzy mode
function applyFuzzyOffset(coord: Coordinate): Coordinate {
  const METERS_PER_DEGREE_LAT = 111000
  const offsetMeters = () => (Math.random() - 0.5) * 1000 // ±500m
  return {
    latitude: coord.latitude + offsetMeters() / METERS_PER_DEGREE_LAT,
    longitude:
      coord.longitude +
      offsetMeters() /
        (METERS_PER_DEGREE_LAT * Math.cos((coord.latitude * Math.PI) / 180)),
  }
}

// Convert GPS coordinate to explored_paths tile key (for recording path points)
function coordToPathPoint(coord: Coordinate): { lat: number; lng: number } {
  // Round to ~50m precision for path simplification
  const PRECISION = 0.0005
  return {
    lat: Math.round(coord.latitude / PRECISION) * PRECISION,
    lng: Math.round(coord.longitude / PRECISION) * PRECISION,
  }
}

// ─── Task 47: cacheNearbyPlaces ──────────────────────────────────────────────

const CACHE_RADIUS_METERS = 500
const CACHE_EXPIRY_DAYS = 30

export interface CachedLandmark {
  id: string
  place_id: string
  name: string
  latitude: number
  longitude: number
  place_type: string
  radius_meters: number
}

function getPlaceRadius(types: string[]): number {
  if (types.some((t) => ['library', 'university', 'stadium', 'gym'].includes(t))) return 100
  if (types.some((t) => ['restaurant', 'food', 'meal_takeaway'].includes(t))) return 20
  if (types.some((t) => ['cafe', 'bar'].includes(t))) return 10
  return 30
}

function getPlaceType(types: string[]): string {
  if (types.includes('library')) return 'library'
  if (types.includes('gym')) return 'gym'
  if (types.includes('cafe')) return 'cafe'
  if (types.includes('restaurant') || types.includes('food')) return 'restaurant'
  if (types.includes('university')) return 'university'
  return 'other'
}

export async function cacheNearbyPlaces(coord: Coordinate): Promise<CachedLandmark[]> {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY!

  // Check if we already have valid cache for this area
  const { data: cached } = await supabase
    .from('landmarks')
    .select('*')
    .gte('expires_at', new Date().toISOString())
    .filter(
      'latitude',
      'gte',
      coord.latitude - 0.005
    )
    .filter('latitude', 'lte', coord.latitude + 0.005)
    .filter('longitude', 'gte', coord.longitude - 0.005)
    .filter('longitude', 'lte', coord.longitude + 0.005)

  if (cached && cached.length > 0) return cached as CachedLandmark[]

  // Call Places API
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${coord.latitude},${coord.longitude}&radius=${CACHE_RADIUS_METERS}&key=${apiKey}`

  const response = await fetch(url)
  const data = await response.json()

  if (!data.results) return []

  const places = data.results.map((place: any) => ({
    place_id: place.place_id,
    name: place.name,
    latitude: place.geometry.location.lat,
    longitude: place.geometry.location.lng,
    place_type: getPlaceType(place.types ?? []),
    radius_meters: getPlaceRadius(place.types ?? []),
    cached_at: new Date().toISOString(),
    expires_at: new Date(
      Date.now() + CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    ).toISOString(),
  }))

  // Upsert into landmarks table (update if place_id already exists)
  const { data: inserted } = await supabase
    .from('landmarks')
    .upsert(places, { onConflict: 'place_id' })
    .select()

  return (inserted ?? []) as CachedLandmark[]
}

// ─── Task 46: getFriendLocations ─────────────────────────────────────────────

export async function getFriendLocations(): Promise<FriendLocation[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  // Get all accepted friends
  const { data: friendships } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)

  if (!friendships || friendships.length === 0) return []

  const friendIds = friendships.map((f) =>
    f.requester_id === user.id ? f.addressee_id : f.requester_id
  )

  // Get friend locations joined with profile info
  const { data: locations } = await supabase
    .from('user_locations')
    .select(
      `
      user_id,
      latitude,
      longitude,
      updated_at,
      profiles!inner (
        real_name,
        avatar_url,
        pet_avatar_url,
        identity_mode,
        location_sharing
      )
    `
    )
    .in('user_id', friendIds)

  if (!locations) return []

  return locations
    .filter((loc: any) => loc.profiles.location_sharing !== 'off')
    .map((loc: any) => ({
      user_id: loc.user_id,
      latitude: loc.latitude,
      longitude: loc.longitude,
      updated_at: loc.updated_at,
      display_name: loc.profiles.real_name,
      avatar_url: loc.profiles.avatar_url,
      pet_avatar_url: loc.profiles.pet_avatar_url,
      identity_mode: loc.profiles.identity_mode ?? 'real',
    }))
}

// ─── Task 45: updateMyLocation ────────────────────────────────────────────────

export async function updateMyLocation(coord: Coordinate): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  // Get user's location sharing preference
  const { data: profile } = await supabase
    .from('profiles')
    .select('location_sharing')
    .eq('id', user.id)
    .single()

  const mode: LocationSharingMode = profile?.location_sharing ?? 'fuzzy'

  if (mode === 'off') {
    // Delete location record so friends can't see user
    await supabase.from('user_locations').delete().eq('user_id', user.id)
  } else {
    const storedCoord = mode === 'fuzzy' ? applyFuzzyOffset(coord) : coord

    // Upsert location (insert or update)
    await supabase.from('user_locations').upsert({
      user_id: user.id,
      latitude: storedCoord.latitude,
      longitude: storedCoord.longitude,
      updated_at: new Date().toISOString(),
    })
  }

  // Always record path point for Discovery mode (regardless of sharing setting)
  const point = coordToPathPoint(coord)
  await supabase.from('explored_paths').insert({
    user_id: user.id,
    coordinates: [point],
  })
}

// ─── Task 48: discoverLandmark ────────────────────────────────────────────────

const TITLES: Record<string, { junior: string; senior: string }> = {
  library:    { junior: 'Bookworm',       senior: 'Library King' },
  restaurant: { junior: 'Big Eater',      senior: 'Dining Hall King' },
  gym:        { junior: 'Gym Newbie',     senior: 'Gym Fanatic' },
  cafe:       { junior: 'Coffee Lover',   senior: 'Coffee Addict' },
  other:      { junior: 'Explorer',       senior: 'Master Explorer' },
}

const XP_TIME_REWARDS: Record<string, { min30: number; min60: number }> = {
  library:    { min30: 3, min60: 8 },
  restaurant: { min30: 2, min60: 6 },
  gym:        { min30: 2, min60: 5 },
  cafe:       { min30: 2, min60: 5 },
  other:      { min30: 2, min60: 5 },
}

export interface DiscoverResult {
  xp_earned: number
  is_first_visit: boolean
  title_unlocked: string | null
  last_visited_at: string | null
  visit_count: number
  weekly_time_spent: number
}

async function addXP(userId: string, xp: number): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('pet_xp, pet_level')
    .eq('id', userId)
    .single()
  if (!profile) return
  const newXP = (profile.pet_xp ?? 0) + xp
  const newLevel = Math.floor(newXP / 100) + 1
  await supabase
    .from('profiles')
    .update({ pet_xp: newXP, pet_level: newLevel })
    .eq('id', userId)
}

// Called by frontend after user stops at a place for 2 minutes
export async function discoverLandmark(
  coord: Coordinate,
  minutesSpent: number // passed from frontend timer (2, 30, or 60)
): Promise<DiscoverResult | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Get nearby cached landmarks
  const landmarks = await cacheNearbyPlaces(coord)
  if (!landmarks.length) return null

  // Find closest landmark within its radius
  const landmark = landmarks.find((lm) => {
    const dist = Math.sqrt(
      Math.pow((coord.latitude - lm.latitude) * 111000, 2) +
      Math.pow(
        (coord.longitude - lm.longitude) *
          111000 *
          Math.cos((coord.latitude * Math.PI) / 180),
        2
      )
    )
    return dist <= lm.radius_meters
  })

  if (!landmark) return null

  const placeType = landmark.place_type ?? 'other'
  const timeRewards = XP_TIME_REWARDS[placeType] ?? XP_TIME_REWARDS.other
  const titles = TITLES[placeType] ?? TITLES.other

  // Fetch existing exploration record
  const { data: existing } = await supabase
    .from('explorations')
    .select('*')
    .eq('user_id', user.id)
    .eq('landmark_id', landmark.id)
    .single()

  let xpEarned = 0
  let isFirstVisit = false
  let titleUnlocked: string | null = null

  // Check if weekly time needs reset
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay() + 1) // Monday
  weekStart.setHours(0, 0, 0, 0)
  const needsReset =
    !existing ||
    new Date(existing.week_start_date) < weekStart

  if (!existing) {
    // First visit ever
    isFirstVisit = true
    xpEarned = 10
    await supabase.from('explorations').insert({
      user_id: user.id,
      landmark_id: landmark.id,
      visit_count: 1,
      total_time_spent: minutesSpent,
      weekly_time_spent: minutesSpent,
      week_start_date: weekStart.toISOString().split('T')[0],
      titles_earned: [],
      first_visited_at: now.toISOString(),
      last_visited_at: now.toISOString(),
    })
  } else {
    // Subsequent visit
    const prevWeeklyTime = needsReset ? 0 : existing.weekly_time_spent
    const newWeeklyTime = prevWeeklyTime + minutesSpent
    const newTotalTime = existing.total_time_spent + minutesSpent
    const newVisitCount = existing.visit_count + 1

    // Time-based XP (only award for newly crossed thresholds this week)
    if (prevWeeklyTime < 30 && newWeeklyTime >= 30) xpEarned += timeRewards.min30
    if (prevWeeklyTime < 60 && newWeeklyTime >= 60) xpEarned += timeRewards.min60

    // Title unlock
    const earnedTitles: string[] = [...(existing.titles_earned ?? [])]
    if (newVisitCount >= 7 && !earnedTitles.includes(titles.junior)) {
      earnedTitles.push(titles.junior)
      titleUnlocked = titles.junior
    }
    if (newVisitCount >= 30 && !earnedTitles.includes(titles.senior)) {
      earnedTitles.push(titles.senior)
      titleUnlocked = titles.senior
    }

    await supabase.from('explorations').update({
      visit_count: newVisitCount,
      total_time_spent: newTotalTime,
      weekly_time_spent: newWeeklyTime,
      week_start_date: weekStart.toISOString().split('T')[0],
      titles_earned: earnedTitles,
      last_visited_at: now.toISOString(),
    }).eq('id', existing.id)
  }

  if (xpEarned > 0) await addXP(user.id, xpEarned)

  return {
    xp_earned: xpEarned,
    is_first_visit: isFirstVisit,
    title_unlocked: titleUnlocked,
    last_visited_at: existing?.last_visited_at ?? null,
    visit_count: existing ? existing.visit_count + 1 : 1,
    weekly_time_spent: existing
      ? (needsReset ? 0 : existing.weekly_time_spent) + minutesSpent
      : minutesSpent,
  }
}

// ─── Task 49: subscribeToFriendLocations ─────────────────────────────────────

export function subscribeToFriendLocations(
  friendIds: string[],
  onUpdate: (location: FriendLocation) => void
) {
  const channel = supabase
    .channel('friend-locations')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_locations',
        filter: `user_id=in.(${friendIds.join(',')})`,
      },
      async (payload) => {
        const loc = payload.new as any
        if (!loc?.user_id) return

        const { data: profile } = await supabase
          .from('profiles')
          .select('real_name, avatar_url, pet_avatar_url, identity_mode, location_sharing')
          .eq('id', loc.user_id)
          .single()

        if (!profile || profile.location_sharing === 'off') return

        onUpdate({
          user_id: loc.user_id,
          latitude: loc.latitude,
          longitude: loc.longitude,
          updated_at: loc.updated_at,
          display_name: profile.real_name,
          avatar_url: profile.avatar_url,
          pet_avatar_url: profile.pet_avatar_url,
          identity_mode: profile.identity_mode ?? 'real',
        })
      }
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}

// ─── Task 50: getExploredPaths ────────────────────────────────────────────────

export async function getExploredPaths(): Promise<
  { lat: number; lng: number }[][]
> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('explored_paths')
    .select('coordinates')
    .eq('user_id', user.id)

  return (data ?? []).map((row) => row.coordinates)
}

// ─── Task 51: getWeeklyRankings ───────────────────────────────────────────────

export interface RankingEntry {
  rank: number
  user_id: string
  display_name: string
  avatar_url: string | null
  pet_avatar_url: string | null
  identity_mode: 'real' | 'pet'
  weekly_time_spent: number
  active_title: string | null
}

export interface WeeklyRankings {
  [placeType: string]: RankingEntry[]
}

export async function getWeeklyRankings(university: string): Promise<WeeklyRankings> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const placeTypes = ['library', 'restaurant', 'gym', 'cafe']
  const rankings: WeeklyRankings = {}

  for (const placeType of placeTypes) {
    const { data } = await supabase
      .from('explorations')
      .select(`
        weekly_time_spent,
        active_title,
        profiles!inner (
          id,
          real_name,
          avatar_url,
          pet_avatar_url,
          identity_mode,
          university
        ),
        landmarks!inner (
          place_type
        )
      `)
      .eq('landmarks.place_type', placeType)
      .eq('profiles.university', university)
      .order('weekly_time_spent', { ascending: false })
      .limit(3)

    if (!data) continue

    rankings[placeType] = data.map((row: any, index: number) => ({
      rank: index + 1,
      user_id: row.profiles.id,
      display_name: row.profiles.real_name,
      avatar_url: row.profiles.avatar_url,
      pet_avatar_url: row.profiles.pet_avatar_url,
      identity_mode: row.profiles.identity_mode ?? 'real',
      weekly_time_spent: row.weekly_time_spent,
      active_title: row.active_title,
    }))
  }

  return rankings
}
