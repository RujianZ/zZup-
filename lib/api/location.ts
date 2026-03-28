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

function applyFuzzyOffset(coord: Coordinate): Coordinate {
  const GRID = 0.005 // ~555m per grid cell
  return {
    latitude: Math.round(coord.latitude / GRID) * GRID,
    longitude: Math.round(coord.longitude / GRID) * GRID,
  }
}

// Returns the most recent Monday at 00:00:00 PT, as a UTC midnight Date
function getWeekStart(): Date {
  const now = new Date()
  const ptNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
  const day = ptNow.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const daysToMonday = day === 0 ? 6 : day - 1
  ptNow.setDate(ptNow.getDate() - daysToMonday)
  ptNow.setHours(0, 0, 0, 0)
  const y = ptNow.getFullYear()
  const m = String(ptNow.getMonth() + 1).padStart(2, '0')
  const d = String(ptNow.getDate()).padStart(2, '0')
  return new Date(`${y}-${m}-${d}T00:00:00.000Z`)
}

// ─── Anti-cheat: clampMinutesSpent ───────────────────────────────────────────

const MAX_MINUTES_PER_CALL = 480  // hard cap: 8 hours per single call
const TIMESTAMP_TOLERANCE = 10    // minutes of grace for network / processing delay

function clampMinutesSpent(
  claimed: number,
  prevWeeklyTime: number,
  lastVisitedAt: string | null,
  isNewWeek: boolean
): number {
  // First visit or new week: no prior timestamp to compare, apply hard cap only
  if (!lastVisitedAt || isNewWeek) {
    return Math.min(Math.max(0, claimed), MAX_MINUTES_PER_CALL)
  }
  // Same week: cap by both hard limit and elapsed real-world time
  const delta = Math.max(0, claimed - prevWeeklyTime)
  const elapsedMinutes = (Date.now() - new Date(lastVisitedAt).getTime()) / 60000
  const safeDelta = Math.min(delta, MAX_MINUTES_PER_CALL, elapsedMinutes + TIMESTAMP_TOLERANCE)
  return prevWeeklyTime + safeDelta
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
  if (types.some((t) => ['restaurant', 'food', 'meal_takeaway', 'meal_delivery', 'cafeteria'].includes(t))) return 30
  if (types.some((t) => ['cafe', 'bar'].includes(t))) return 15
  return 30
}

function getPlaceType(types: string[]): string {
  if (types.includes('library')) return 'library'
  if (types.includes('gym')) return 'gym'
  if (types.includes('cafe')) return 'cafe'
  if (types.some((t) => ['restaurant', 'food', 'meal_takeaway', 'meal_delivery', 'cafeteria'].includes(t))) return 'dining'
  return 'other'
}

export async function cacheNearbyPlaces(coord: Coordinate): Promise<CachedLandmark[]> {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY!
  const now = new Date().toISOString()

  // Check if we have already searched near this location
  const { data: zones } = await supabase
    .from('landmark_cache_zones')
    .select('id')
    .gte('expires_at', now)
    .filter('latitude', 'gte', coord.latitude - 0.005)
    .filter('latitude', 'lte', coord.latitude + 0.005)
    .filter('longitude', 'gte', coord.longitude - 0.005)
    .filter('longitude', 'lte', coord.longitude + 0.005)
    .limit(1)

  if (zones && zones.length > 0) {
    // This area has been searched before — return whatever landmarks we have
    const { data: cached } = await supabase
      .from('landmarks')
      .select('*')
      .gte('expires_at', now)
      .filter('latitude', 'gte', coord.latitude - 0.005)
      .filter('latitude', 'lte', coord.latitude + 0.005)
      .filter('longitude', 'gte', coord.longitude - 0.005)
      .filter('longitude', 'lte', coord.longitude + 0.005)
    return (cached ?? []) as CachedLandmark[]
  }

  // New area — call Google Places API
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
    expires_at: new Date(Date.now() + CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  }))

  const { data: inserted } = await supabase
    .from('landmarks')
    .upsert(places, { onConflict: 'place_id', ignoreDuplicates: true })
    .select()

  // Record that this area has been searched
  await supabase.from('landmark_cache_zones').insert({
    latitude: coord.latitude,
    longitude: coord.longitude,
  })

  return (inserted ?? []) as CachedLandmark[]
}

// ─── Task 46: getFriendLocations ─────────────────────────────────────────────

export async function getFriendLocations(): Promise<FriendLocation[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data: friendships } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)

  if (!friendships || friendships.length === 0) return []

  const friendIds = friendships.map((f) =>
    f.requester_id === user.id ? f.addressee_id : f.requester_id
  )

  const { data: locations } = await supabase
    .from('user_locations')
    .select(`
      user_id,
      latitude,
      longitude,
      updated_at,
      profiles!inner (
        real_name,
        pet_name,
        avatar_url,
        pet_avatar_url,
        identity_mode,
        location_sharing
      )
    `)
    .in('user_id', friendIds)

  if (!locations) return []

  return locations
    .filter((loc: any) => loc.profiles.location_sharing !== 'off')
    .map((loc: any) => ({
      user_id: loc.user_id,
      latitude: loc.latitude,
      longitude: loc.longitude,
      updated_at: loc.updated_at,
      display_name: loc.profiles.identity_mode === 'pet'
        ? (loc.profiles.pet_name ?? loc.profiles.real_name)
        : (loc.profiles.real_name ?? loc.profiles.pet_name),
      avatar_url: loc.profiles.avatar_url,
      pet_avatar_url: loc.profiles.pet_avatar_url,
      identity_mode: loc.profiles.identity_mode ?? 'real',
    }))
}

// ─── Task 45: updateMyLocation ───────────────────────────────────────────────
// Only updates friend-visible location. Discovery path recording is handled
// separately by saveExploredPath(), called by Ethan's frontend.

export async function updateMyLocation(coord: Coordinate): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { data: profile } = await supabase
    .from('profiles')
    .select('location_sharing')
    .eq('id', user.id)
    .single()

  const mode: LocationSharingMode = profile?.location_sharing ?? 'fuzzy'

  if (mode === 'off') {
    await supabase.from('user_locations').delete().eq('user_id', user.id)
  } else {
    const storedCoord = mode === 'fuzzy' ? applyFuzzyOffset(coord) : coord
    await supabase.from('user_locations').upsert({
      user_id: user.id,
      latitude: storedCoord.latitude,
      longitude: storedCoord.longitude,
      updated_at: new Date().toISOString(),
    })
  }
}

// ─── Task 44 (new): saveExploredPath ─────────────────────────────────────────
// Called by Ethan's frontend after RDP simplification.
// Stores one path segment (array of coordinates) as a single row.

export async function saveExploredPath(
  coordinates: { lat: number; lng: number }[]
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || coordinates.length === 0) return

  await supabase.from('explored_paths').insert({
    user_id: user.id,
    coordinates,
  })
}

// ─── Task 48: discoverLandmark ────────────────────────────────────────────────
// minutesSpent = cumulative weekly total at this landmark (maintained by frontend)
// Called at: 2 min (first arrival), 30 min cumulative, 60 min cumulative

const TITLES: Record<string, { junior: string; senior: string }> = {
  library: { junior: 'Bookworm',      senior: 'Library King'    },
  dining:  { junior: 'Big Eater',     senior: 'Dining Hall King'},
  gym:     { junior: 'Gym Newbie',    senior: 'Gym Fanatic'     },
  cafe:    { junior: 'Coffee Lover',  senior: 'Coffee Addict'   },
  other:   { junior: 'Explorer',      senior: 'Master Explorer' },
}

const XP_TIME_REWARDS: Record<string, { min30: number; min60: number }> = {
  library: { min30: 3, min60: 8 },
  dining:  { min30: 2, min60: 6 },
  gym:     { min30: 2, min60: 5 },
  cafe:    { min30: 2, min60: 5 },
  other:   { min30: 2, min60: 5 },
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

export async function discoverLandmark(
  coord: Coordinate,
  minutesSpent: number
): Promise<DiscoverResult | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const landmarks = await cacheNearbyPlaces(coord)
  if (!landmarks.length) return null

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

  const { data: existing } = await supabase
    .from('explorations')
    .select('*')
    .eq('user_id', user.id)
    .eq('landmark_id', landmark.id)
    .maybeSingle()

  let xpEarned = 0
  let isFirstVisit = false
  let titleUnlocked: string | null = null
  let safeMinutes = minutesSpent
  const now = new Date()
  const weekStart = getWeekStart()
  const needsReset = !existing || new Date(existing.week_start_date) < weekStart

  if (!existing) {
    // First visit ever
    safeMinutes = clampMinutesSpent(minutesSpent, 0, null, false)
    isFirstVisit = true
    xpEarned = 10
    if (safeMinutes >= 30) xpEarned += timeRewards.min30
    if (safeMinutes >= 60) xpEarned += timeRewards.min60
    await supabase.from('explorations').insert({
      user_id: user.id,
      landmark_id: landmark.id,
      visit_count: 1,
      total_time_spent: safeMinutes,
      weekly_time_spent: safeMinutes,
      week_start_date: weekStart.toISOString().split('T')[0],
      titles_earned: [],
      first_visited_at: now.toISOString(),
      last_visited_at: now.toISOString(),
    })
  } else {
    // Return visit — minutesSpent is the cumulative weekly total passed by frontend
    const prevWeeklyTime = needsReset ? 0 : existing.weekly_time_spent
    safeMinutes = clampMinutesSpent(minutesSpent, prevWeeklyTime, existing.last_visited_at, needsReset)
    const newWeeklyTime = safeMinutes
    const newMinutesAdded = Math.max(0, newWeeklyTime - prevWeeklyTime)
    const newTotalTime = existing.total_time_spent + newMinutesAdded
    const newVisitCount = existing.visit_count + 1

    // Award XP only when crossing weekly thresholds for the first time
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

    const { data: updated } = await supabase
      .from('explorations')
      .update({
        visit_count: newVisitCount,
        total_time_spent: newTotalTime,
        weekly_time_spent: newWeeklyTime,
        week_start_date: weekStart.toISOString().split('T')[0],
        titles_earned: earnedTitles,
        last_visited_at: now.toISOString(),
      })
      .eq('id', existing.id)
      .eq('last_visited_at', existing.last_visited_at)
      .select('id')

    // Concurrent update detected — another request already modified this record
    if (!updated || updated.length === 0) return null
  }

  if (xpEarned > 0) await addXP(user.id, xpEarned)

  return {
    xp_earned: xpEarned,
    is_first_visit: isFirstVisit,
    title_unlocked: titleUnlocked,
    last_visited_at: existing?.last_visited_at ?? null,
    visit_count: existing ? existing.visit_count + 1 : 1,
    weekly_time_spent: safeMinutes,
  }
}

// ─── Task 49: subscribeToFriendLocations ─────────────────────────────────────

export async function subscribeToFriendLocations(
  friendIds: string[],
  onUpdate: (location: FriendLocation) => void
): Promise<() => void> {
  if (friendIds.length === 0) return () => {}

  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, real_name, pet_name, avatar_url, pet_avatar_url, identity_mode, location_sharing')
    .in('id', friendIds)

  const profileCache = new Map<string, any>()
  profilesData?.forEach((p) => profileCache.set(p.id, p))

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
      (payload) => {
        const loc = payload.new as any
        if (!loc?.user_id) return

        const profile = profileCache.get(loc.user_id)
        if (!profile || profile.location_sharing === 'off') return

        onUpdate({
          user_id: loc.user_id,
          latitude: loc.latitude,
          longitude: loc.longitude,
          updated_at: loc.updated_at,
          display_name: profile.identity_mode === 'pet'
            ? (profile.pet_name ?? profile.real_name)
            : (profile.real_name ?? profile.pet_name),
          avatar_url: profile.avatar_url,
          pet_avatar_url: profile.pet_avatar_url,
          identity_mode: profile.identity_mode ?? 'real',
        })
      }
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}

// ─── Task 48b: setActiveTitle ─────────────────────────────────────────────────
// title = null means unequip (user chooses to show no title)

export async function setActiveTitle(
  explorationId: string,
  title: string | null
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { data: exploration } = await supabase
    .from('explorations')
    .select('titles_earned')
    .eq('id', explorationId)
    .eq('user_id', user.id)
    .single()

  if (!exploration) return

  // Prevent equipping a title the user hasn't earned
  if (title !== null && !exploration.titles_earned.includes(title)) return

  await supabase
    .from('explorations')
    .update({ active_title: title })
    .eq('id', explorationId)
    .eq('user_id', user.id)
}

// ─── Task 50: getExploredPaths ────────────────────────────────────────────────

export async function getExploredPaths(): Promise<{ lat: number; lng: number }[][]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
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
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return {}

  const { data } = await supabase.rpc('get_weekly_rankings', { p_university: university })
  if (!data) return {}

  const rankings: WeeklyRankings = {}
  for (const row of data as any[]) {
    if (!rankings[row.place_type]) rankings[row.place_type] = []
    rankings[row.place_type].push({
      rank: Number(row.rank),
      user_id: row.user_id,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      pet_avatar_url: row.pet_avatar_url,
      identity_mode: row.identity_mode,
      weekly_time_spent: Number(row.weekly_time_spent),
      active_title: row.active_title,
    })
  }

  return rankings
}

// ─── setRankingPreferences ────────────────────────────────────────────────────

export async function setRankingPreferences(
  optIn: boolean,
  identityMode: 'real' | 'pet'
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('profiles')
    .update({
      ranking_opt_in: optIn,
      ranking_identity_mode: identityMode,
    })
    .eq('id', user.id)
}
