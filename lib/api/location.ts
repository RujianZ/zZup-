import { supabase } from '../supabase'
import { addXP, FOREGROUND_XP_PER_HOUR } from './_xp'
import { getProfile } from './auth'

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
  mode: 'precise' | 'fuzzy'  // From user_locations.mode (added in migration 40)
  updated_at: string
  display_name: string
  avatar_url: string | null
  pet_avatar_url: string | null
  identity_mode: 'real' | 'pet'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function applyFuzzyOffset(coord: Coordinate): Coordinate {
  // Multiply by 5 then divide by 1000 instead of multiplying by 0.005 directly,
  // avoiding binary floating point drift (0.005 has no exact binary representation)
  return {
    latitude: Math.round(coord.latitude / 0.005) * 5 / 1000,
    longitude: Math.round(coord.longitude / 0.005) * 5 / 1000,
  }
}

// Note: anti-cheat logic (clampMinutesSpent, getWeekStart) and TITLES table
// have been moved into the discover_landmark SECURITY DEFINER RPC (migration 42).
// The corresponding JS helpers were removed since they're no longer called.

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
  if (types.some((t) => ['cafe', 'bakery', 'bar'].includes(t))) return 15
  return 30
}

function getPlaceType(types: string[]): string {
  if (types.includes('library')) return 'library'
  if (types.includes('gym')) return 'gym'
  if (types.some((t) => ['cafe', 'bakery'].includes(t))) return 'coffee_shop'
  if (types.some((t) => ['restaurant', 'food', 'meal_takeaway', 'meal_delivery', 'cafeteria'].includes(t))) return 'dining'
  return 'other'
}

export async function cacheNearbyPlaces(coord: Coordinate): Promise<CachedLandmark[]> {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY!
  const now = new Date().toISOString()

  // Snap to 0.005° grid so all users in the same cell share one cache record
  // applyFuzzyOffset uses the same 0.005° grid — reused here for cache keying
  const snapped = applyFuzzyOffset(coord)

  // Check if this exact grid cell has been cached
  const { data: zones } = await supabase
    .from('landmark_cache_zones')
    .select('id')
    .gte('expires_at', now)
    .eq('latitude', snapped.latitude)
    .eq('longitude', snapped.longitude)
    .limit(1)

  if (zones && zones.length > 0) {
    // Grid cell cached — return landmarks within this cell from DB
    const { data: cached } = await supabase
      .from('landmarks')
      .select('*')
      .gte('expires_at', now)
      .filter('latitude', 'gte', snapped.latitude - 0.005)
      .filter('latitude', 'lte', snapped.latitude + 0.005)
      .filter('longitude', 'gte', snapped.longitude - 0.005)
      .filter('longitude', 'lte', snapped.longitude + 0.005)
    return (cached ?? []) as CachedLandmark[]
  }

  // New grid cell — call Google Places API centered on grid point
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${snapped.latitude},${snapped.longitude}&radius=${CACHE_RADIUS_METERS}&key=${apiKey}`
  const response = await fetch(url)
  const data = await response.json()

  if (!data.results) return []

  const expiresAt = new Date(Date.now() + CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const places = data.results.map((place: any) => ({
    place_id: place.place_id,
    name: place.name,
    latitude: place.geometry.location.lat,
    longitude: place.geometry.location.lng,
    place_type: getPlaceType(place.types ?? []),
    radius_meters: getPlaceRadius(place.types ?? []),
    cached_at: now,
    expires_at: expiresAt,
  }))

  const { data: inserted } = await supabase
    .from('landmarks')
    .upsert(places, { onConflict: 'place_id', ignoreDuplicates: true })
    .select()

  // Mark this grid cell as cached; upsert refreshes expires_at if cell already exists
  await supabase.from('landmark_cache_zones').upsert(
    { latitude: snapped.latitude, longitude: snapped.longitude, cached_at: now, expires_at: expiresAt },
    { onConflict: 'latitude,longitude' }
  )

  return (inserted ?? []) as CachedLandmark[]
}

// ─── Task 46: getFriendLocations ─────────────────────────────────────────────
// Reads mode directly from user_locations (migration 40).
// Row existence in user_locations <=> user is currently sharing —
// off-mode users have no row, so RLS naturally excludes them.

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
      mode,
      updated_at,
      profiles!inner (
        real_name,
        pet_name,
        avatar_url,
        pet_avatar_url,
        identity_mode
      )
    `)
    .in('user_id', friendIds)

  if (!locations) return []

  return locations.map((loc: any) => ({
    user_id: loc.user_id,
    latitude: loc.latitude,
    longitude: loc.longitude,
    mode: loc.mode,
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
// Reads own location_sharing via getProfile() (which uses get_my_profile RPC)
// because direct SELECT on profiles.location_sharing is REVOKE'd from
// authenticated (migration 25 — kept private from strangers).
//
// Writes the resolved mode into user_locations.mode so friends can render
// the correct UI (precise = small dot, fuzzy = big circle) without needing
// access to profiles.location_sharing.
//
// off mode = delete the row entirely (no presence on map).

export async function updateMyLocation(coord: Coordinate): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const profile = await getProfile()
  const mode: LocationSharingMode = profile?.location_sharing ?? 'fuzzy'

  if (mode === 'off') {
    await supabase.from('user_locations').delete().eq('user_id', user.id)
    return
  }

  const storedCoord = mode === 'fuzzy' ? applyFuzzyOffset(coord) : coord
  await supabase.from('user_locations').upsert({
    user_id: user.id,
    latitude: storedCoord.latitude,
    longitude: storedCoord.longitude,
    mode,
    updated_at: new Date().toISOString(),
  })
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
//
// Server-side anti-cheat (clampMinutesSpent, optimistic lock, radius check),
// XP awarding, and title unlocking all happen inside the discover_landmark RPC
// (migration 42). JS just needs to identify which landmark the user is at and
// pass the current coordinate + minutes_spent.

export interface DiscoverResult {
  xp_earned: number
  is_first_visit: boolean
  title_unlocked: string | null
  last_visited_at: string | null
  visit_count: number
  weekly_time_spent: number
}

export async function discoverLandmark(
  coord: Coordinate,
  minutesSpent: number
): Promise<DiscoverResult | null> {
  const landmarks = await cacheNearbyPlaces(coord)
  if (!landmarks.length) return null

  // Find which landmark user is currently within radius of.
  // The RPC re-verifies this server-side; this is just to pick the landmark_id.
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

  const { data, error } = await supabase.rpc('discover_landmark', {
    p_landmark_id: landmark.id,
    p_lat: coord.latitude,
    p_lng: coord.longitude,
    p_minutes_spent: minutesSpent,
  })

  if (error || !data) return null

  return data as DiscoverResult
}

// ─── Task 49: subscribeToFriendLocations ─────────────────────────────────────
// Doesn't query profiles.location_sharing anymore (REVOKE'd in migration 25).
// Mode is read from the realtime payload's user_locations.mode column.
// Off-mode users have no row → no realtime event for them.

export async function subscribeToFriendLocations(
  friendIds: string[],
  onUpdate: (location: FriendLocation) => void
): Promise<() => void> {
  if (friendIds.length === 0) return () => {}

  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, real_name, pet_name, avatar_url, pet_avatar_url, identity_mode')
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
        if (!profile) return

        onUpdate({
          user_id: loc.user_id,
          latitude: loc.latitude,
          longitude: loc.longitude,
          mode: loc.mode,
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
// title = null means unequip.
// Server-side validation (title must be in titles_earned) happens inside
// the set_active_title RPC (migration 42). Direct UPDATE on explorations is
// REVOKE'd, so going through this RPC is the only way.

export async function setActiveTitle(title: string | null): Promise<void> {
  await supabase.rpc('set_active_title', { p_title: title })
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
      identity_mode: row.identity_mode,
      weekly_time_spent: Number(row.weekly_time_spent),
      active_title: row.active_title,
    })
  }

  return rankings
}

// ─── addForegroundXP ─────────────────────────────────────────────────────────
// Called by the frontend every hour while the app is in the foreground.

export async function addForegroundXP(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return
  await addXP(user.id, FOREGROUND_XP_PER_HOUR)
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
