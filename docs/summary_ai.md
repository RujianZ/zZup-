# SUDO App — AI Technical Reference
> For AI assistants working on this codebase | Updated March 2026
> Base path: `D:\sudo-app\`

---

## Project Structure

```
D:\sudo-app\
├── lib/
│   ├── supabase.ts          # Supabase client init (AsyncStorage session)
│   └── api/
│       ├── auth.ts          # Auth + profile functions (6 functions)
│       ├── posts.ts         # Posts, likes, comments (11 functions)
│       ├── groups.ts        # Groups + DMs (7 functions)
│       ├── messages.ts      # Messaging (4 functions)
│       ├── location.ts      # Location, landmarks, exploration (10 functions)
│       └── friends.ts       # Friends, blocks, search (13 functions)
├── supabase/migrations/     # 15 SQL migration files (all executed in Supabase)
│   ├── 25_user_profile_table.sql
│   ├── 26_friendships_table.sql
│   ├── 27_groups_table.sql
│   ├── 28_posts_table.sql
│   ├── 29_offer_verifications.sql
│   ├── 30_realtime_config.sql
│   ├── 35_storage_policies.sql
│   ├── 40_user_locations.sql
│   ├── 41_landmarks.sql
│   ├── 42_explorations.sql
│   ├── 44_explored_paths.sql
│   ├── 45_weekly_rankings.sql
│   ├── 46_landmark_cache_zones.sql
│   ├── 53_handle_new_user.sql
│   └── 54_profile_visibility.sql
├── docs/
│   ├── summary_human.md     # Plain-language doc for Ethan
│   └── summary_ai.md        # This file
├── App.tsx
└── app.json
```

**Missing files (planned, not yet created):**
- `lib/api/verification.ts` — Offer verification API

---

## Database Schema Overview

**17 tables, all with RLS enabled.** Schema is live in Supabase (Joe and Ethan are both owners).

### Core Tables

| Table | PK | Key Foreign Keys | Delete Behavior |
|-------|-----|-----------------|-----------------|
| `profiles` | `id` (uuid) | `auth.users(id)` | CASCADE |
| `friendships` | `id` (uuid) | `profiles(id)` x2 | SET NULL |
| `blocked_users` | `(blocker_id, blocked_id)` | `profiles(id)` x2 | CASCADE |
| `groups` | `id` (uuid) | `profiles(id)` (created_by) | SET NULL |
| `group_members` | `id` (uuid) | `groups`, `profiles` | CASCADE |
| `messages` | `id` (uuid) | `groups(id)`, `profiles(id)` | CASCADE / SET NULL |
| `posts` | `id` (uuid) | `profiles(id)` | SET NULL |
| `post_viewers` | `(post_id, user_id)` | `posts`, `profiles` | CASCADE |
| `likes` | `id` (uuid) | `posts`, `profiles` | CASCADE |
| `comments` | `id` (uuid) | `posts`, `profiles` | CASCADE / SET NULL |
| `offer_verifications` | `id` (uuid) | `profiles(id)` | CASCADE |
| `user_locations` | `user_id` (uuid) | `profiles(id)` | CASCADE |
| `landmarks` | `id` (uuid) | — | — |
| `explorations` | `id` (uuid) | `profiles`, `landmarks` | CASCADE |
| `explored_paths` | `id` (uuid) | `profiles(id)` | CASCADE |
| `landmark_cache_zones` | `id` (uuid) | — | — |

### Key Constraints

```sql
-- friendships: only pending/accepted (no blocked status)
status CHECK (status IN ('pending', 'accepted'))

-- posts: no 'public' visibility
visibility CHECK (visibility IN ('logged_in', 'university', 'friends', 'specific_friends', 'private'))

-- landmarks: validated place_type
place_type CHECK (place_type IN ('library', 'gym', 'cafe', 'dining', 'other'))

-- offer_verifications: one pending per user
CREATE UNIQUE INDEX one_pending_per_user ON offer_verifications(user_id) WHERE status = 'pending'

-- explorations: one record per user+landmark
UNIQUE(user_id, landmark_id)

-- landmark_cache_zones: one record per grid point
UNIQUE(latitude, longitude)
```

### Database Functions (PostgreSQL)

| Function | Security | Trigger | Purpose |
|----------|----------|---------|---------|
| `handle_new_user()` | DEFINER | AFTER INSERT ON auth.users | Auto-create profile row on registration |
| `reassign_group_owner()` | DEFINER | BEFORE DELETE ON profiles | Transfer group ownership when user deletes account |
| `get_weekly_rankings(p_university text)` | DEFINER | RPC (called via supabase.rpc()) | Aggregate weekly rankings, bypasses RLS safely |
| `update_likes_count()` | — | AFTER INSERT OR DELETE ON likes | Auto-update posts.likes_count |
| `update_comments_count()` | — | AFTER INSERT OR DELETE ON comments | Auto-update posts.comments_count |

### Realtime Tables
`messages`, `posts`, `likes`, `comments`, `user_locations`

---

## lib/api/auth.ts

### Imports & Dependencies
```typescript
import { supabase } from '../supabase'
```

### Types Defined Here
- `Profile` — complete profile interface (all columns)
- `ProfileUpdate` — Partial<Pick<Profile, updatable fields>>

### Functions

---

#### `signUp(email, password) → { userId, error }`
**File:** `lib/api/auth.ts:64`

Calls `supabase.auth.signUp()`. On success, `handle_new_user` DB trigger auto-inserts into `profiles`.

**Branches:**
- Success → `{ userId: string, error: null }`
- Failure → `{ userId: null, error: message }`

---

#### `signIn(email, password) → { userId, error }`
**File:** `lib/api/auth.ts:78`

Calls `supabase.auth.signInWithPassword()`.

**Branches:**
- Success → `{ userId: string, error: null }`
- Failure → `{ userId: null, error: message }`

---

#### `signOut() → { error }`
**File:** `lib/api/auth.ts:92`

Calls `supabase.auth.signOut()`.

---

#### `getProfile(userId?) → Profile | null`
**File:** `lib/api/auth.ts:101`

**Logic:**
1. `getUser()` — must be logged in
2. `targetId = userId ?? user.id`
3. `isSelf = targetId === user.id`
4. SELECT * FROM profiles WHERE id = targetId
5. If self → return raw data
6. If other → apply privacy filter

**Privacy filter for other users:**
```
Always null: personal_email, personal_email_verified, edu_email, region,
             location_sharing, ranking_opt_in, ranking_identity_mode
Always false: show_date_of_birth, show_nationality, show_qr_code (TD-5 fixed: viewer
             should not see the target's privacy toggle states)
Conditional: date_of_birth (if show_date_of_birth), nationality (if show_nationality),
             qr_code_url (if show_qr_code)
profile_visibility switch:
  'real_only'    → null: pet_name, pet_avatar_url, pet_bio, pet_level, pet_xp
  'pet_only'     → null: real_name, avatar_url, bio, date_of_birth, nationality, qr_code_url
                   (TD-4 fixed: pet_only hides all real-identity fields regardless of show_* toggles)
  'real_with_pet' → no additional filtering
```

**Branches:**
- Not logged in → return null
- Self → return full Profile
- Other → return filtered Profile

---

#### `getMyTitles() → string[]`
**File:** `lib/api/auth.ts:167`

SELECT titles_earned FROM explorations WHERE user_id = auth.uid()
Flattens all arrays, deduplicates via Set.

**Returns:** deduplicated string[] of all earned titles across all landmarks

---

#### `updateProfile(fields: ProfileUpdate) → { error }`
**File:** `lib/api/auth.ts:186`

UPDATE profiles SET ...fields WHERE id = auth.uid()

**Updatable fields:** real_name, bio, avatar_url, date_of_birth, nationality, region, university, personal_email, edu_email, pet_name, pet_avatar_url, pet_bio, identity_mode, location_sharing, ranking_opt_in, ranking_identity_mode, profile_visibility, show_date_of_birth, show_nationality, show_qr_code

---

## lib/api/posts.ts

### Types Defined Here
- `Post` — post with joined author info + liked_by_me
- `Comment` — comment with joined author info

### Visibility Values (v6 — no 'public')
```typescript
'logged_in' | 'university' | 'friends' | 'specific_friends' | 'private'
```

---

#### `getFeed(options?) → Post[]`
**File:** `lib/api/posts.ts:48`

**Query:**
```
SELECT posts.*, profiles!(posts_user_id_fkey)(real_name, pet_name, avatar_url, pet_avatar_url, university)
FROM posts
[WHERE visibility = options.visibility]
[WHERE created_at < options.before]
ORDER BY created_at DESC
LIMIT options.limit (default 20)
```
RLS on posts handles visibility filtering automatically.

**Block filtering (runs before query):**
1. `Promise.all` two parallel queries: blocked_users WHERE blocker_id=uid AND blocked_users WHERE blocked_id=uid
2. Builds `blockedIds` set (both directions)
3. Filters returned posts: excludes any post where `user_id IN blockedIds`

**Then:** batch fetch likes WHERE user_id = auth.uid() AND post_id IN (postIds) → builds likedSet

**Author name/avatar selection:**
```typescript
author_name = identity_mode === 'real' ? profile.real_name : profile.pet_name
author_avatar_url = identity_mode === 'real' ? profile.avatar_url : profile.pet_avatar_url
```

**Branches:**
- No visibility filter → returns all RLS-visible posts (minus blocked users)
- visibility = 'university' → RLS checks university match server-side
- visibility = 'friends' → RLS checks friendships table server-side
- visibility = 'specific_friends' → RLS checks post_viewers table server-side
- before provided → cursor pagination (older posts)
- Not logged in → return []

**Removed in v6:** university parameter (was buggy — `.eq('profiles.university', x)` filtered join result, not parent rows)

---

#### `createPost(content, identityMode, imageUrl?, visibility?) → { postId, error }`
**File:** `lib/api/posts.ts:118`

INSERT INTO posts (user_id, identity_mode, content, image_url, visibility)
visibility defaults to 'logged_in'.

**Post-creation for specific_friends:** caller must follow up with addPostViewer() for each friend.

---

#### `deletePost(postId) → { error }`
**File:** `lib/api/posts.ts:148`

1. SELECT image_url FROM posts WHERE id = postId
2. DELETE FROM posts WHERE id = postId (RLS: only owner)
3. If image_url exists → supabase.storage.from('post-images').remove([path])
   Path extraction: URL → find `/object/public/post-images/` → decode path

**Side effects:** cascades delete likes, comments, post_viewers

---

#### `toggleLike(postId) → { liked, error }`
**File:** `lib/api/posts.ts:171`

1. SELECT id FROM likes WHERE post_id = postId AND user_id = auth.uid() (.maybeSingle())
2. If exists → DELETE FROM likes
3. If not exists → INSERT INTO likes

**Note:** likes_count is updated automatically by the `on_like_change` DB trigger (AFTER INSERT OR DELETE ON likes → UPDATE posts SET likes_count). No manual count update in JS.

---

#### `getComments(postId) → Comment[]`
**File:** `lib/api/posts.ts:227`

**Pre-query:** `auth.getUser()` call required (auth check).

SELECT with join: `profiles!comments_user_id_fkey(real_name, pet_name, avatar_url, pet_avatar_url)`
ORDER BY created_at ASC

**Block filtering:** same pattern as getFeed — fetches block list in both directions, filters out comments from blocked/blocking users before returning.

---

#### `createComment(postId, content, identityMode) → { commentId, error }`
**File:** `lib/api/posts.ts:265`

INSERT INTO comments.

**Note:** comments_count is updated automatically by the `on_comment_change` DB trigger (AFTER INSERT OR DELETE ON comments → UPDATE posts SET comments_count). No manual count update in JS.

---

#### `deleteComment(commentId) → { error }`
**File:** `lib/api/posts.ts:299`

DELETE FROM comments WHERE id = commentId (RLS: only owner)

**Note:** comments_count decrement and post_id lookup are handled by the `on_comment_change` DB trigger. No manual count update or post_id lookup in JS.

---

#### `editPost(postId, content, imageUrl?) → { error }`
**File:** `lib/api/posts.ts`

1. SELECT image_url FROM posts WHERE id = postId AND user_id = auth.uid()
2. UPDATE posts SET content = content, edited_at = now() [+ image_url changes] WHERE id = postId
3. Image handling:
   - `imageUrl` = undefined → keep existing image (no change to image_url column)
   - `imageUrl` = null → delete existing image from Storage + set image_url = null
   - `imageUrl` = new string → delete old image from Storage (if any) + set image_url = new string

RLS enforces owner-only (UPDATE policy: auth.uid() = user_id).

---

#### `editComment(commentId, content) → { error }`
**File:** `lib/api/posts.ts`

UPDATE comments SET content = content, edited_at = now() WHERE id = commentId

RLS enforces owner-only. Only content is editable; identity_mode and post association are immutable.

---

#### `addPostViewer(postId, friendId) → { error }`
**File:** `lib/api/posts.ts` (after deleteComment)

INSERT INTO post_viewers (post_id, user_id=friendId)
RLS: only post owner can insert (verified via subquery: auth.uid() = SELECT user_id FROM posts WHERE id = post_id)

---

#### `removePostViewer(postId, friendId) → { error }`
**File:** `lib/api/posts.ts` (after addPostViewer)

DELETE FROM post_viewers WHERE post_id = postId AND user_id = friendId
RLS: only post owner can delete.

---

## lib/api/groups.ts

### Types Defined Here
- `Group` — groups table row
- `CreateGroupData` — input for createGroup

### Internal Helpers
- `syncMembersCount(groupId)` — COUNT group_members WHERE group_id, then UPDATE groups.members_count

---

#### `createGroup(data) → Group | null`
**File:** `lib/api/groups.ts:43`

1. INSERT INTO groups (chat_type='group', ...)
2. INSERT INTO group_members (role='admin', user_id=auth.uid())
3. UPDATE groups SET members_count = 1

---

#### `getMyGroups() → Group[]`
**File:** `lib/api/groups.ts:80`

SELECT group_id FROM group_members WHERE user_id = auth.uid()
→ SELECT * FROM groups WHERE id IN (groupIds)

---

#### `joinGroup(groupId) → { error }`
**File:** `lib/api/groups.ts:102`

INSERT INTO group_members (role='member') → syncMembersCount()
RLS blocks joining edu_verified groups if not verified/same university.

---

#### `leaveGroup(groupId) → { error }`
**File:** `lib/api/groups.ts:122`

1. SELECT created_by FROM groups WHERE id = groupId
2. DELETE FROM group_members WHERE group_id = groupId AND user_id = auth.uid()
3. If leaver is created_by:
   SELECT user_id FROM group_members WHERE group_id = groupId ORDER BY joined_at ASC LIMIT 1
   UPDATE groups SET created_by = nextMember.user_id (or null if empty)
4. syncMembersCount()

**Note:** reassign_group_owner() DB trigger handles account deletion scenario separately.

---

#### `searchGroups(keyword, university?) → Group[]`
**File:** `lib/api/groups.ts:164`

WHERE is_searchable=true AND chat_type='group' AND members_count>=3
AND group_type IN ('open','official','edu_verified')
AND name ILIKE '%keyword%'
If university → OR filter: open/official OR (edu_verified AND university=?)

---

#### `createDirectMessage(friendId) → Group | null`
**File:** `lib/api/groups.ts:190`

**Optimized — 2 parallel queries (no loop):**
1. `Promise.all`:
   - SELECT group_id FROM group_members WHERE user_id=auth.uid() AND groups.chat_type='direct'
   - SELECT group_id FROM group_members WHERE user_id=friendId AND groups.chat_type='direct'
2. Find intersection of both group_id sets in JS → that's the existing shared DM group
3. If match found → SELECT * FROM groups WHERE id = match → return
4. If no match → INSERT groups (chat_type='direct') + INSERT group_members x2

---

#### `removeMember(groupId, targetUserId) → { error }`
**File:** `lib/api/groups.ts:249`

1. SELECT created_by FROM groups WHERE id = groupId
2. If created_by != auth.uid() → return { error: 'Permission denied' }
3. If targetUserId == auth.uid() → return { error: 'Cannot remove yourself' }
4. DELETE FROM group_members → syncMembersCount()

---

## lib/api/messages.ts

### Types Defined Here
- `Message` — messages table row, includes:
  - `author_name: string | null` — resolved from identity_mode at query time
  - `author_avatar_url: string | null` — resolved from identity_mode at query time
  - Note: Realtime-pushed messages (raw INSERT events) will NOT have author_name/author_avatar_url populated

---

#### `getMessages(groupId, limit=30, before?) → Message[]`
**File:** `lib/api/messages.ts:20`

```
SELECT messages.*, profiles!messages_user_id_fkey(real_name, pet_name, avatar_url, pet_avatar_url, identity_mode)
FROM messages
WHERE group_id = groupId
[AND created_at < before]
ORDER BY created_at DESC LIMIT limit
```

Maps result to Message objects: resolves `author_name` and `author_avatar_url` based on each message's `identity_mode`.

**No DELETE policy:** by design, messages cannot be deleted.

---

#### `sendMessage(groupId, content, identityMode, imageUrl?) → Message | null`
**File:** `lib/api/messages.ts:47`

INSERT INTO messages → returns inserted row.

---

#### `subscribeToMessages(groupId, onMessage) → () => void`
**File:** `lib/api/messages.ts:82`

Supabase Realtime channel: `messages:${groupId}`
Event: INSERT on messages table, filter: group_id=eq.${groupId}
Returns unsubscribe function: `() => supabase.removeChannel(channel)`

**Note:** Realtime-pushed message objects are raw DB rows and will not have `author_name`/`author_avatar_url`. Frontend must resolve author info separately if needed.

---

#### `editMessage(messageId, content) → { error }`
**File:** `lib/api/messages.ts`

UPDATE messages SET content = content, edited_at = now() WHERE id = messageId

RLS enforces owner-only. Only content is editable; identity_mode and group association are immutable.

---

## lib/api/location.ts

### Types Defined Here
- `LocationSharingMode` — 'precise' | 'fuzzy' | 'off'
- `Coordinate` — { latitude, longitude }
- `FriendLocation` — location + display info
- `CachedLandmark` — landmark from DB
- `DiscoverResult` — XP, title, visit info
- `RankingEntry` / `WeeklyRankings` — ranking structures

### Internal Helpers
- `applyFuzzyOffset(coord)` — rounds to nearest 0.005° grid (~555m cells). Uses `Math.round(val / 0.005) * 5 / 1000` to avoid floating point precision issues with 0.005.
- `getWeekStart()` — returns most recent Monday 00:00 PT as UTC Date
- `clampMinutesSpent(claimed, prevWeekly, lastVisitedAt, isNewWeek)` — anti-cheat
- `getPlaceRadius(types)` — Google types → radius_meters
- `getPlaceType(types)` — Google types → SUDO place_type
- `addXP(userId, xp)` — reads pet_xp/pet_level, adds xp, recalculates level (floor(xp/100)+1)

### Constants
```typescript
CACHE_RADIUS_METERS = 500        // Google Places search radius
CACHE_EXPIRY_DAYS = 30           // landmark cache TTL
MAX_MINUTES_PER_CALL = 480       // anti-cheat hard cap
TIMESTAMP_TOLERANCE = 10         // anti-cheat grace minutes
```

---

#### `updateMyLocation(coord) → void`
**File:** `lib/api/location.ts:219`

1. SELECT location_sharing FROM profiles WHERE id = auth.uid()
2. mode = 'off' → DELETE FROM user_locations WHERE user_id = auth.uid()
3. mode = 'fuzzy' → coord = applyFuzzyOffset(coord) → UPSERT user_locations
4. mode = 'precise' → UPSERT user_locations with raw coord

---

#### `getFriendLocations() → FriendLocation[]`
**File:** `lib/api/location.ts:161`

1. SELECT requester_id, addressee_id FROM friendships WHERE status='accepted' AND (requester_id=uid OR addressee_id=uid)
2. Derive friendIds
3. SELECT user_locations.*, profiles!inner(real_name,pet_name,avatar_url,pet_avatar_url,identity_mode,location_sharing) WHERE user_id IN (friendIds)
4. Filter: location_sharing != 'off'
5. Map: display_name = identity_mode==='pet' ? pet_name ?? real_name : real_name ?? pet_name

---

#### `subscribeToFriendLocations(friendIds, onUpdate) → Promise<() => void>`
**File:** `lib/api/location.ts:428`

1. Batch fetch profiles for all friendIds → build profileCache (Map<userId, profile>)
2. Subscribe to postgres_changes on user_locations, filter: user_id=in.(friendIds)
3. On event: lookup profile from cache, skip if location_sharing='off', call onUpdate()
4. Return `() => supabase.removeChannel(channel)`

**Tech Debt:** profileCache built once at subscribe time; profile changes (identity_mode, location_sharing) during subscription require re-subscribe.

---

#### `cacheNearbyPlaces(coord) → Promise<CachedLandmark[]>`
**File:** `lib/api/location.ts:99`

**Grid-based caching design:**
- User coordinates are snapped to the nearest 0.005° grid point via `applyFuzzyOffset(coord)` before any cache lookup or API call.
- All users within the same ~555m grid cell share one cache record and one Google API call.
- Adjacent cells are independently cached; coverage expands as more users visit new cells.

**Cache hit path:**
1. Snap coord to grid point (snapped.latitude, snapped.longitude)
2. SELECT id FROM landmark_cache_zones WHERE expires_at >= now() AND latitude = snapped.latitude AND longitude = snapped.longitude (exact match on grid key)
3. If exists → SELECT * FROM landmarks WHERE expires_at >= now() AND lat ∈ ±0.005 AND lng ∈ ±0.005 → return

**Cache miss path:**
1. Fetch Google Places Nearby Search centered on snapped grid point: `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=snapped_lat,snapped_lng&radius=500&key=...`
2. Map results: place_id, name, lat, lng, place_type (via getPlaceType), radius_meters (via getPlaceRadius), cached_at, expires_at (+30d)
3. UPSERT landmarks ON CONFLICT place_id DO NOTHING (ignoreDuplicates: true)
4. UPSERT INTO landmark_cache_zones (latitude=snapped.latitude, longitude=snapped.longitude) ON CONFLICT (latitude, longitude) → updates expires_at (refreshes TTL when revisited)
5. Return inserted landmarks

**Tech Debt:** API key (EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) exposed client-side.

---

#### `discoverLandmark(coord, minutesSpent) → Promise<DiscoverResult | null>`
**File:** `lib/api/location.ts:308`

**Flow:**
1. `cacheNearbyPlaces(coord)` → get nearby landmarks
2. Find landmark where Haversine distance ≤ radius_meters
3. SELECT * FROM explorations WHERE user_id=uid AND landmark_id=landmark.id (.single())
4. `weekStart = getWeekStart()`
5. `needsReset = !existing || new Date(existing.week_start_date) < weekStart`

**Branch A — No existing record (first ever visit):**
```
safeMinutes = clampMinutesSpent(minutesSpent, 0, null, false)
isFirstVisit = true
xpEarned = 10
if safeMinutes >= 30 → xpEarned += timeRewards.min30
if safeMinutes >= 60 → xpEarned += timeRewards.min60
INSERT explorations (visit_count=1, total_time_spent=safeMinutes, weekly_time_spent=safeMinutes, ...)
```

**Branch B — Existing record:**
```
prevWeeklyTime = needsReset ? 0 : existing.weekly_time_spent
safeMinutes = clampMinutesSpent(minutesSpent, prevWeeklyTime, existing.last_visited_at, needsReset)
newWeeklyTime = safeMinutes
newMinutesAdded = max(0, newWeeklyTime - prevWeeklyTime)
newTotalTime = existing.total_time_spent + newMinutesAdded
newVisitCount = existing.visit_count + 1

XP: if prevWeeklyTime < 30 && newWeeklyTime >= 30 → xpEarned += min30
    if prevWeeklyTime < 60 && newWeeklyTime >= 60 → xpEarned += min60

Titles: if newVisitCount >= 7 && !titles.includes(junior) → unlock junior
        if newVisitCount >= 30 && !titles.includes(senior) → unlock senior

UPDATE explorations ... WHERE id=existing.id AND last_visited_at=existing.last_visited_at
  (optimistic lock — concurrent update returns empty array → return null)
```

**XP table:**
```
library: { min30: 3, min60: 8 }
dining:  { min30: 2, min60: 6 }
gym/cafe/other: { min30: 2, min60: 5 }
First visit always: +10 XP
```

**Title table:**
```
library: { junior: 'Bookworm', senior: 'Library King' }
dining:  { junior: 'Big Eater', senior: 'Dining Hall King' }
gym:     { junior: 'Gym Newbie', senior: 'Gym Fanatic' }
cafe:    { junior: 'Coffee Lover', senior: 'Coffee Addict' }
other:   { junior: 'Explorer', senior: 'Master Explorer' }
```

**Anti-cheat (clampMinutesSpent):**
```
If no lastVisitedAt or isNewWeek → min(max(0, claimed), 480)
Else → delta = claimed - prevWeeklyTime
       elapsedMinutes = (now - lastVisitedAt) / 60000
       safeDelta = min(delta, 480, elapsedMinutes + 10)
       return prevWeeklyTime + safeDelta
```

**Null returns:** not logged in, no landmark found, concurrent update detected

---

#### `setActiveTitle(explorationId, title) → void`
**File:** `lib/api/location.ts:481`

1. SELECT titles_earned FROM explorations WHERE id=explorationId AND user_id=auth.uid()
2. If title != null && !titles_earned.includes(title) → silent return (security)
3. UPDATE explorations SET active_title = title WHERE id=explorationId AND user_id=auth.uid()

---

#### `saveExploredPath(coordinates) → void`
**File:** `lib/api/location.ts:250`

INSERT INTO explored_paths (user_id, coordinates) — coordinates is JSONB [{lat,lng},...]

---

#### `getExploredPaths() → {lat,lng}[][]`
**File:** `lib/api/location.ts:511`

SELECT coordinates FROM explored_paths WHERE user_id = auth.uid()
Returns array of path segments.

---

#### `getWeeklyRankings(university) → WeeklyRankings`
**File:** `lib/api/location.ts:542`

`supabase.rpc('get_weekly_rankings', { p_university: university })`
DB function verifies caller is edu_verified=true AND university=p_university before returning data.
Groups rows by place_type into WeeklyRankings object.

---

#### `setRankingPreferences(optIn, identityMode) → void`
**File:** `lib/api/location.ts:571`

UPDATE profiles SET ranking_opt_in=optIn, ranking_identity_mode=identityMode WHERE id=auth.uid()

---

## lib/api/friends.ts

### Types Defined Here
- `FriendProfile` — friend list item: friendship_id + friend's profile fields
- `FriendRequest` — pending/sent request item: friendship_id + profile fields + created_at
- `UserSearchResult` — search result item: profile fields (no friendship_id)
- `BlockedUser` — blocked user item: blocked_id, sudo_id, real_name, avatar_url
- `FriendshipStatus` — `'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'blocked'`

### Design Decisions
- `blockUser()` deletes ALL friendship records (both pending and accepted) between the two users
- `getFriendshipStatus()` returns `'none'` when the other user has blocked you (does not expose blocking)
- `searchUsers()` filters both directions of blocks using two parallel queries (PostgREST does not support subqueries in filters)
- `cancelRequest()` is separate from `removeFriend()` — different security semantics (requester vs either party)

---

#### `sendFriendRequest(addresseeId) → { error }`
**File:** `lib/api/friends.ts:64`

**Logic:**
1. Check `blocked_users` for any block in either direction (RLS allows this — `blocked_users` SELECT policy includes `auth.uid() = blocked_id`)
2. If block found → return `{ error: '无法发送申请' }` (same message regardless of direction)
3. Check `friendships` for reverse pending request (addresseeId → uid)
4. If reverse request exists → return `{ error: '对方已向你发送了好友申请，请前往申请列表接受' }`
5. INSERT INTO friendships (requester_id=uid, addressee_id)

**Branches:**
- Block in either direction → error (unified message, does not reveal who blocked)
- Addressee already sent a request → error with prompt to check pending list
- Success → `{ error: null }`

---

#### `acceptFriendRequest(friendshipId) → { error }`
**File:** `lib/api/friends.ts:105`

UPDATE friendships SET status='accepted' WHERE id=friendshipId
RLS (`addressee_can_update_friendship`): only addressee can update. No JS auth check needed.

---

#### `declineFriendRequest(friendshipId) → { error }`
**File:** `lib/api/friends.ts:119`

DELETE FROM friendships WHERE id=friendshipId AND status='pending'
RLS: addressee or requester can delete. `status='pending'` filter prevents accidentally deleting an accepted friendship.

---

#### `cancelRequest(friendshipId) → { error }`
**File:** `lib/api/friends.ts:133`

DELETE FROM friendships WHERE id=friendshipId AND requester_id=uid AND status='pending'
Extra `requester_id=uid` filter ensures only the sender can cancel (belt-and-suspenders over RLS).

---

#### `removeFriend(friendshipId) → { error }`
**File:** `lib/api/friends.ts:155`

DELETE FROM friendships WHERE id=friendshipId
RLS (`both_can_delete_friendship`): either party can delete.

---

#### `blockUser(targetId) → { error }`
**File:** `lib/api/friends.ts:169`

1. INSERT INTO blocked_users (blocker_id=uid, blocked_id=targetId)
2. If INSERT fails (already blocked) → return error immediately
3. DELETE FROM friendships WHERE (requester=uid AND addressee=targetId) OR (requester=targetId AND addressee=uid)
   No status filter — deletes both pending and accepted records.

**Branches:**
- Already blocked → error from INSERT unique constraint
- Had friendship (any status) → deleted
- No friendship → friendship DELETE is a no-op, still returns success

---

#### `unblockUser(targetId) → { error }`
**File:** `lib/api/friends.ts:198`

DELETE FROM blocked_users WHERE blocker_id=uid AND blocked_id=targetId

---

#### `getFriends() → FriendProfile[]`
**File:** `lib/api/friends.ts:218`

**Query:**
```
SELECT friendships (id, requester_id, addressee_id)
  + requester:profiles!friendships_requester_id_fkey (id, sudo_id, real_name, pet_name, avatar_url, pet_avatar_url, university, profile_visibility, identity_mode)
  + addressee:profiles!friendships_addressee_id_fkey (same fields)
WHERE status='accepted' AND (requester_id=uid OR addressee_id=uid)
```

**Map logic:** `friend = requester_id === uid ? addressee : requester`
Returns both joined profiles, picks the one that isn't the current user.

---

#### `getPendingRequests() → FriendRequest[]`
**File:** `lib/api/friends.ts:260`

SELECT friendships WHERE status='pending' AND addressee_id=uid
JOIN requester:profiles!friendships_requester_id_fkey
Returns: friendship_id, created_at + requester's profile fields

---

#### `getSentRequests() → FriendRequest[]`
**File:** `lib/api/friends.ts:297`

SELECT friendships WHERE status='pending' AND requester_id=uid
JOIN addressee:profiles!friendships_addressee_id_fkey
Returns: friendship_id, created_at + addressee's profile fields

---

#### `getFriendshipStatus(targetId) → FriendshipStatus`
**File:** `lib/api/friends.ts:336`

**Logic:**
1. SELECT blocked_users WHERE blocker_id=uid AND blocked_id=targetId → if found, return `'blocked'`
2. SELECT friendships WHERE (uid↔targetId in either direction) → `.maybeSingle()`
3. No record → `'none'`
4. status='accepted' → `'accepted'`
5. requester_id=uid → `'pending_sent'`
6. else → `'pending_received'`

**Note:** Does NOT check if targetId blocked uid. If blocked by target, returns `'none'`.

---

#### `searchUsers(keyword) → UserSearchResult[]`
**File:** `lib/api/friends.ts:373`

**Logic:**
1. `Promise.all` two parallel queries:
   - `blocked_users` WHERE blocker_id=uid → get `blocked_id[]` (people I blocked)
   - `blocked_users` WHERE blocked_id=uid → get `blocker_id[]` (people who blocked me)
2. Combine into `excludeIds = [uid, ...iBlocked, ...blockedMe]`
3. SELECT profiles WHERE (sudo_id=keyword OR real_name ILIKE '%keyword%') AND id NOT IN (excludeIds) LIMIT 20

**Search fields:** `sudo_id` exact match OR `real_name` case-insensitive partial match.
**Does NOT search:** `pet_name` (real_name is required at onboarding; pet-only users are reachable via post/comment user_id).

**Returns:** `UserSearchResult[]` — includes all users regardless of friendship status (front-end calls `getFriendshipStatus` to determine button state).

---

#### `getBlockedUsers() → BlockedUser[]`
**File:** `lib/api/friends.ts:408`

SELECT blocked_users WHERE blocker_id=uid
JOIN blocked:profiles!blocked_users_blocked_id_fkey (sudo_id, real_name, avatar_url)
Returns minimal fields sufficient to identify and unblock the user.

---

## Missing API File: lib/api/verification.ts

**Status:** Not yet created. offer_verifications table exists in DB.

---

## Known Technical Debt

| ID | Severity | Location | Issue | Status |
|----|----------|----------|-------|--------|
| TD-1 | HIGH | `location.ts:discoverLandmark` | Client-supplied GPS coords trusted; cheat by sending fake coords to earn XP/titles | Open |
| TD-2 | MED | `posts.ts:toggleLike,createComment,deleteComment` | likes_count/comments_count: read-then-write race condition | RESOLVED — DB triggers on_like_change/on_comment_change |
| TD-3 | MED | App layer | blocked_users not filtered in feed/comments | RESOLVED — block filtering added to getFeed and getComments |
| TD-4 | MED | `auth.ts:getProfile` | pet_only + show_date_of_birth=true still returned date_of_birth | RESOLVED — pet_only now nulls date_of_birth, nationality, qr_code_url |
| TD-5 | MED | `auth.ts:getProfile` | Privacy meta-fields (show_*, profile_visibility) exposed via `...p` spread | RESOLVED — show_* fields set to false when returning other users' profiles |
| TD-6 | MED | `location.ts:cacheNearbyPlaces` | EXPO_PUBLIC_GOOGLE_MAPS_API_KEY exposed client-side | Open |
| TD-7 | LOW | `groups.ts:createDirectMessage` | N+1 query loop checking for existing DM conversation | RESOLVED — replaced with 2 parallel queries + JS intersection |
| TD-9 | LOW | `location.ts:cacheNearbyPlaces` | landmark_cache_zones: unlimited INSERT per user | RESOLVED — grid-based caching with UNIQUE(latitude, longitude) + UPSERT |
| TD-10 | LOW | `user_locations RLS + location.ts` | location_sharing='off' only filtered JS-side; RLS friends_can_read didn't check sharing mode | RESOLVED — RLS policy now also requires location_sharing IN ('precise', 'fuzzy') |

---

## Migration Notes

### 28_posts_table.sql
Defines `posts`, `likes`, `comments`, `post_viewers` tables and their RLS policies.
Cleanup section drops `on_like_change`, `on_comment_change` triggers and `update_likes_count`, `update_comments_count` functions if they exist.
Includes `update_likes_count()` trigger function and `on_like_change` trigger (AFTER INSERT OR DELETE ON likes → UPDATE posts SET likes_count).
Includes `update_comments_count()` trigger function and `on_comment_change` trigger (AFTER INSERT OR DELETE ON comments → UPDATE posts SET comments_count).

### 40_user_locations.sql
Defines `user_locations` table and RLS policies.
`friends_can_read` policy: allows SELECT if caller has an accepted friendship with the row owner AND `location_sharing IN ('precise', 'fuzzy')` from the profiles table. The location_sharing check is enforced at DB level (not just JS layer).

### 46_landmark_cache_zones.sql
Defines `landmark_cache_zones` table.
Includes `UNIQUE(latitude, longitude)` constraint — ensures one cache record per grid cell, enables UPSERT on conflict.
Includes `authenticated_can_update` RLS policy — allows authenticated users to UPDATE rows (required for UPSERT to refresh expires_at on revisited cells).

---

## RLS Policy Summary

### profiles
- SELECT: `auth.uid() IS NOT NULL`
- INSERT: `auth.uid() = id`
- UPDATE: `auth.uid() = id`
- DELETE: `auth.uid() = id`

### friendships
- SELECT: `auth.uid() = requester_id OR auth.uid() = addressee_id`
- INSERT: `auth.uid() = requester_id`
- UPDATE: `auth.uid() = addressee_id` ← only addressee can accept
- DELETE: `auth.uid() = requester_id OR auth.uid() = addressee_id`

### blocked_users
- SELECT: `auth.uid() = blocker_id OR auth.uid() = blocked_id` ← blocked user can see they are blocked
- INSERT/DELETE: `auth.uid() = blocker_id`

### posts
- SELECT: complex — logged in + visibility checks (university match, friendships, post_viewers)
- INSERT: `auth.uid() = user_id`
- UPDATE/DELETE: `auth.uid() = user_id`

### post_viewers
- SELECT/INSERT/DELETE: `auth.uid() = (SELECT user_id FROM posts WHERE id = post_id)`

### user_locations
- SELECT: own row OR accepted friend with location_sharing IN ('precise', 'fuzzy')
- INSERT/UPDATE/DELETE: own row

### landmarks
- SELECT/INSERT: `auth.uid() IS NOT NULL`
- No UPDATE policy (security: prevent radius_meters manipulation)

### explorations
- All ops: `auth.uid() = user_id` (owner-only)

### offer_verifications
- SELECT/INSERT: `auth.uid() = user_id`
- No UPDATE (only service role via Edge Function can update status)

### landmark_cache_zones
- SELECT/INSERT: `auth.uid() IS NOT NULL`
- UPDATE: `auth.uid() IS NOT NULL` (needed for UPSERT to refresh expires_at)

---

## Storage Buckets

| Bucket | Public | Upload Path Restriction | Who Can Read |
|--------|--------|------------------------|--------------|
| `avatars` | Yes | `auth.uid()::text = foldername[1]` | Everyone |
| `post-images` | Yes | `auth.uid()::text = foldername[1]` | Everyone |
| `offer-screenshots` | No | `auth.uid()::text = foldername[1]` | Owner only (service role for Edge Fn) |

Path format: `{user_id}/filename.ext`

---

## Supabase Client

**File:** `lib/supabase.ts`

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
// Uses EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
// Session persisted via AsyncStorage
```

---

## Environment Variables (.env)

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=...
```
ANTHROPIC_API_KEY is set in Supabase Edge Function secrets (not in .env).
