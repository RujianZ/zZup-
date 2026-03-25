# Location API — `lib/api/location.ts`

Backend author: Joe
Last updated: 2026-03-24
Target readers: Frontend developer, AI assistants

---

## Overview

This file is the **single source of truth for all location, map, and gamification logic** in the app.
It talks to Supabase (PostgreSQL + Realtime) and the Google Places API.

Key responsibilities:
- Sharing and reading friend locations (precise / fuzzy / off)
- Caching nearby places (landmarks) via Google Places API
- Recording explored map paths
- Gamification: visiting landmarks earns XP and unlocks titles
- Weekly per-place-type leaderboard scoped to one university

---

## Types

### `LocationSharingMode`
```typescript
type LocationSharingMode = 'precise' | 'fuzzy' | 'off'
```
Stored in `profiles.location_sharing`. Controls how the user's coordinates are saved:
- `precise` — raw GPS coordinates
- `fuzzy` — snapped to the nearest ~500 m grid cell (privacy mode)
- `off` — user's row in `user_locations` is deleted

### `Coordinate`
```typescript
interface Coordinate {
  latitude: number
  longitude: number
}
```

### `FriendLocation`
```typescript
interface FriendLocation {
  user_id: string
  latitude: number
  longitude: number
  updated_at: string        // ISO 8601
  display_name: string      // real_name OR pet_name depending on identity_mode
  avatar_url: string | null
  pet_avatar_url: string | null
  identity_mode: 'real' | 'pet'
}
```
Returned by `getFriendLocations()` and emitted by `subscribeToFriendLocations()`.
The frontend should render `avatar_url` when `identity_mode === 'real'`, and `pet_avatar_url` when `identity_mode === 'pet'`.

**Note:** `display_name` currently always returns `real_name`. Identity-mode-aware name switching for map display is a pending frontend decision.

### `CachedLandmark`
```typescript
interface CachedLandmark {
  id: string           // UUID, primary key in landmarks table
  place_id: string     // Google Places place_id
  name: string
  latitude: number
  longitude: number
  place_type: string   // 'library' | 'cafe' | 'gym' | 'dining' | 'other'
  radius_meters: number
}
```

### `DiscoverResult`
```typescript
interface DiscoverResult {
  xp_earned: number
  is_first_visit: boolean
  title_unlocked: string | null
  last_visited_at: string | null   // previous visit timestamp (before this call)
  visit_count: number              // updated count after this call
  weekly_time_spent: number        // clamped minutes after this call
}
```

### `RankingEntry`
```typescript
interface RankingEntry {
  rank: number                       // 1, 2, or 3
  user_id: string
  display_name: string               // real_name or pet_name based on ranking_identity_mode
  avatar_url: string | null
  pet_avatar_url: string | null
  identity_mode: 'real' | 'pet'      // ranking_identity_mode from profiles
  weekly_time_spent: number          // minutes, current week
  active_title: string | null
}
```

### `WeeklyRankings`
```typescript
interface WeeklyRankings {
  [placeType: string]: RankingEntry[]  // keys: 'library', 'cafe', 'gym', 'dining'
}
```

---

## Exported Functions

---

### `updateMyLocation(coord)`

```typescript
async function updateMyLocation(coord: Coordinate): Promise<void>
```

Updates the current user's location in `user_locations`.
Reads `profiles.location_sharing` to decide how to store the coordinate.

**Behavior by mode:**
| Mode | Action |
|------|--------|
| `precise` | Stores exact GPS coordinates |
| `fuzzy` | Snaps to ~500 m grid, stores rounded coordinate |
| `off` | Deletes the user's row from `user_locations` |

**When to call:** On a background timer (e.g., every 30–60 s) while the map screen is active. Do not call when the app is backgrounded — use a foreground-only location watcher.

**Auth:** Must be logged in. No-ops if unauthenticated.

---

### `getFriendLocations()`

```typescript
async function getFriendLocations(): Promise<FriendLocation[]>
```

One-shot fetch of all accepted friends' current locations.

**Steps:**
1. Reads current user's accepted friendships from `friendships`.
2. Bulk-fetches `user_locations` joined with `profiles` for those friend IDs.
3. Filters out any friend with `location_sharing === 'off'`.
4. Returns a `FriendLocation[]`.

**When to call:** On map screen mount (initial load). For live updates, use `subscribeToFriendLocations()` instead or in combination.

**Auth:** Must be logged in.

---

### `subscribeToFriendLocations(friendIds, onUpdate)`

```typescript
async function subscribeToFriendLocations(
  friendIds: string[],
  onUpdate: (location: FriendLocation) => void
): Promise<() => void>
```

Opens a Supabase Realtime WebSocket subscription on `user_locations` filtered to the provided friend IDs.

**Returns:** An unsubscribe function — call it when unmounting the screen.

**Steps:**
1. Pre-fetches all friends' profile data into an in-memory cache (avoids N+1 DB queries on every update).
2. Subscribes to INSERT/UPDATE/DELETE events on `user_locations`.
3. On each event, looks up the friend's profile from cache and calls `onUpdate`.
4. Respects `location_sharing === 'off'` — those updates are silently ignored.

**Usage pattern:**
```typescript
// On screen mount
const friendIds = await getMyFriendIds()   // your own logic
const unsubscribe = await subscribeToFriendLocations(friendIds, (loc) => {
  // update map marker for loc.user_id
})

// On screen unmount
unsubscribe()
```

**Important:** The profile cache is built once at subscription time. If a friend changes their `identity_mode` or `location_sharing` while the subscription is active, the old value will be used until the subscription is re-created.

**Auth:** `friendIds` must be pre-resolved by the caller.

---

### `cacheNearbyPlaces(coord)`

```typescript
async function cacheNearbyPlaces(coord: Coordinate): Promise<CachedLandmark[]>
```

Returns nearby landmarks, fetching from Google Places API only if this area hasn't been searched before.

**Cache logic:**
1. Checks `landmark_cache_zones` for any unexpired zone within ±0.005° (~500 m) of `coord`.
2. **Cache hit:** returns landmarks from `landmarks` table within the same bounding box.
3. **Cache miss:** calls Google Places Nearby Search API (radius = 500 m), upserts results into `landmarks`, records the search zone in `landmark_cache_zones`.

**Cache TTL:** 30 days for both landmarks and cache zones.

**Place type mapping (from Google Maps types → app type):**
| Google Maps types | App `place_type` | `radius_meters` |
|---|---|---|
| `library` | `library` | 100 |
| `gym`, `stadium`, `university` | `gym` | 100 |
| `cafe`, `bar` | `cafe` | 15 |
| `restaurant`, `food`, `meal_takeaway`, `meal_delivery`, `cafeteria` | `dining` | 30 |
| anything else | `other` | 30 |

**Tech debt:** The Google Places API key (`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`) is exposed client-side. Migration to a Supabase Edge Function is deferred until the frontend's own Places API usage is finalized.

**Auth:** Must be logged in (RLS on `landmarks` and `landmark_cache_zones` requires `auth.uid() is not null`).

---

### `discoverLandmark(coord, minutesSpent)`

```typescript
async function discoverLandmark(
  coord: Coordinate,
  minutesSpent: number
): Promise<DiscoverResult | null>
```

The core gamification function. Called when the user has been near a landmark long enough to register a visit.

**`minutesSpent`** is the **cumulative weekly total** at this landmark, maintained by the frontend. Example: if the user spent 20 min last visit and 15 min this visit, pass `35`.

**When to call:**
- At 2 min of continuous presence (first-arrival trigger)
- At 30 min cumulative this week (threshold reward trigger)
- At 60 min cumulative this week (threshold reward trigger)

**Returns `null` if:**
- User is unauthenticated
- No landmark found within `radius_meters` of `coord`
- Concurrent update collision (optimistic lock failed — retry is safe)

**Anti-cheat (`clampMinutesSpent`):**
The backend clamps the claimed `minutesSpent` against real elapsed time. A user cannot inflate their time by passing large values. Details:
- Hard cap: 480 minutes (8 hours) per call
- Same-week visits: capped at `elapsed_since_last_visit + 10 min tolerance`
- New week or first visit: only hard cap applies

**XP rewards:**

| Event | XP |
|---|---|
| First-ever visit to any landmark | +10 |
| Cross 30-min weekly threshold (library) | +3 |
| Cross 30-min weekly threshold (dining/gym/cafe/other) | +2 |
| Cross 60-min weekly threshold (library) | +8 |
| Cross 60-min weekly threshold (dining) | +6 |
| Cross 60-min weekly threshold (gym/cafe/other) | +5 |

Time thresholds are **weekly** (reset each Monday). The first-visit +10 XP is **lifetime** (awarded once per landmark per user).

**Pet level formula:**
```
pet_level = floor(pet_xp / 100) + 1
```
XP is cumulative and never resets.

**Title unlock thresholds (visit count, lifetime):**

| `visit_count` | Place type | Title unlocked |
|---|---|---|
| ≥ 7 | library | `Bookworm` |
| ≥ 30 | library | `Library King` |
| ≥ 7 | dining | `Big Eater` |
| ≥ 30 | dining | `Dining Hall King` |
| ≥ 7 | gym | `Gym Newbie` |
| ≥ 30 | gym | `Gym Fanatic` |
| ≥ 7 | cafe | `Coffee Lover` |
| ≥ 30 | cafe | `Coffee Addict` |
| ≥ 7 | other | `Explorer` |
| ≥ 30 | other | `Master Explorer` |

Only one title can be unlocked per call (the higher threshold takes precedence if both are crossed simultaneously — not possible in normal flow since they are separate calls).

**Optimistic locking:** The UPDATE uses `.eq('last_visited_at', existing.last_visited_at)`. If a concurrent call already updated the row, the update will match 0 rows and `null` is returned. The frontend can safely retry.

**Weekly reset:** `week_start_date` is compared to the current Monday. If they differ, `weekly_time_spent` resets to the new value and XP thresholds restart.

---

### `setActiveTitle(explorationId, title)`

```typescript
async function setActiveTitle(
  explorationId: string,
  title: string | null
): Promise<void>
```

Equips or unequips a title on a specific exploration record.

- `title = null` — unequips (shows no title)
- `title = "Bookworm"` — equips that title if it exists in `explorations.titles_earned`

**Ownership enforced:** The user can only update their own exploration records (both `user_id` and RLS policy check).
**Validation:** If the user tries to equip a title they haven't earned, the call is silently ignored.

**How titles appear in rankings:** The `active_title` column on `explorations` is read by the `get_weekly_rankings` Postgres function and returned in `RankingEntry.active_title`.

---

### `saveExploredPath(coordinates)`

```typescript
async function saveExploredPath(
  coordinates: { lat: number; lng: number }[]
): Promise<void>
```

Saves one segment of the user's explored path for the fog-of-war map overlay.

**When to call:** After path simplification on the frontend (e.g., using the Ramer-Douglas-Peucker algorithm). Do not call with raw GPS samples — simplify first.

**Storage:** Each call inserts one row into `explored_paths` with the full coordinate array as a JSONB column. Multiple rows per user are accumulated over time.

**Auth:** Must be logged in. No-ops on empty array.

---

### `getExploredPaths()`

```typescript
async function getExploredPaths(): Promise<{ lat: number; lng: number }[][]>
```

Returns all saved path segments for the current user.

**Returns:** Array of arrays — each inner array is one path segment (sequence of `{lat, lng}` points).

**When to call:** On fog-of-war map screen mount. The frontend renders each segment as a polyline and uses them to clear the fog overlay.

---

### `getWeeklyRankings(university)`

```typescript
async function getWeeklyRankings(university: string): Promise<WeeklyRankings>
```

Fetches the top-3 weekly leaderboard for each place type at a given university.

**Calls the Postgres RPC function `get_weekly_rankings(p_university)`** (SECURITY DEFINER — bypasses RLS to aggregate all opted-in users' data).

**Access control (enforced server-side):**
- The caller must be `edu_verified = true`
- The caller must belong to `university = p_university`
- If either check fails, the function returns an empty result set

**Scope:** Only users who have set `ranking_opt_in = true` appear. Only the current week's data (since last Monday) is included. Only place types `library`, `cafe`, `gym`, `dining` have rankings.

**Returns:** A `WeeklyRankings` object. Keys are place type strings. Each value is an array of up to 3 `RankingEntry` objects sorted by `weekly_time_spent` descending.

**Example:**
```typescript
const rankings = await getWeeklyRankings('MIT')
// rankings.library[0] → rank 1 for library this week
// rankings.gym        → up to 3 gym entries
// rankings.cafe       → may be missing if no one visited cafes this week
```

**Privacy:** `explorations` rows are private (RLS: owner-only). Rankings are only possible because the Postgres function runs as `SECURITY DEFINER`. Peer users cannot query each other's exploration records directly.

---

### `setRankingPreferences(optIn, identityMode)`

```typescript
async function setRankingPreferences(
  optIn: boolean,
  identityMode: 'real' | 'pet'
): Promise<void>
```

Updates the current user's ranking participation settings.

| Field | Column | Meaning |
|---|---|---|
| `optIn` | `profiles.ranking_opt_in` | Whether the user appears on any leaderboard |
| `identityMode` | `profiles.ranking_identity_mode` | Name/avatar shown on leaderboard |

**All-or-nothing opt-in:** There is no per-place-type opt-in. A user is either on all leaderboards or none.

**Identity mode is independent:** `ranking_identity_mode` is separate from `profiles.identity_mode` (global map display) and from per-content identity mode (posts/messages/comments). Changing one does not affect the others.

**When to show this UI:** In the user settings screen, under a "Rankings" or "Leaderboard" section. Recommended: show the current opt-in toggle and an identity mode picker (Real Me / My Pet) side by side.

---

## Database Schema Quick Reference

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `id`, `real_name`, `pet_name`, `avatar_url`, `pet_avatar_url`, `identity_mode`, `location_sharing`, `edu_verified`, `university`, `pet_xp`, `pet_level`, `ranking_opt_in`, `ranking_identity_mode` | One row per user |
| `user_locations` | `user_id`, `latitude`, `longitude`, `updated_at` | One row per user, upserted; deleted on `location_sharing = 'off'` |
| `friendships` | `requester_id`, `addressee_id`, `status` | `status = 'accepted'` for active friends |
| `landmarks` | `id`, `place_id`, `name`, `latitude`, `longitude`, `place_type`, `radius_meters`, `expires_at` | Cached Google Places results |
| `landmark_cache_zones` | `latitude`, `longitude`, `expires_at` | Tracks where Places API searches have been run |
| `explorations` | `user_id`, `landmark_id`, `visit_count`, `total_time_spent`, `weekly_time_spent`, `week_start_date`, `titles_earned[]`, `active_title`, `first_visited_at`, `last_visited_at` | One row per (user, landmark) pair; private (owner-only RLS) |
| `explored_paths` | `user_id`, `coordinates` (JSONB), `recorded_at` | Multiple rows per user; private |

---

## Identity Mode Design

There are **three independent** identity settings. They do not affect each other:

| Setting | Column | Scope | What it controls |
|---|---|---|---|
| Global map identity | `profiles.identity_mode` | Real-time map display | Which name/avatar friends see when viewing the map |
| Per-content identity | `posts.identity_mode`, `messages.identity_mode`, `comments.identity_mode` | Specific content item | How that specific post/message/comment was authored — immutable after creation |
| Ranking identity | `profiles.ranking_identity_mode` | Leaderboard only | Name/avatar shown on weekly rankings |

Per-content identity is **immutable**: if a user posted as their pet, that post will always show as the pet, even if the user later switches their global identity to real.

---

## Weekly Reset Logic

- "This week" = since the most recent Monday at 00:00:00 local time
- Computed client-side by `getWeekStart()`
- When `discoverLandmark()` detects the stored `week_start_date` is before the current week, it resets `weekly_time_spent` to zero before applying the new value
- XP thresholds (30 min, 60 min) restart each week
- Visit count and total_time_spent are **lifetime** (never reset)

---

## Error Handling Notes

All functions return empty arrays or `null` on failure rather than throwing. The frontend should:
- Treat `null` from `discoverLandmark()` as a soft failure — either no landmark nearby, or a concurrent update collision. A retry is safe.
- Treat empty `WeeklyRankings` as "no data yet this week" — display an empty state UI.
- Not expose Supabase error details to users.

---

## Tech Debt

| Issue | Location | Status |
|---|---|---|
| Google Places API key exposed client-side | `cacheNearbyPlaces()` | Deferred — frontend also uses Places API; migrate both to Edge Function together |
| Profile cache in `subscribeToFriendLocations` is built once and never refreshed | `subscribeToFriendLocations()` | Low risk; re-subscribe on profile change events if needed |
