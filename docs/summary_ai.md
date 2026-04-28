# SUDO App — AI Technical Reference
> For AI assistants working on this codebase | Updated April 2026
> Base path: `D:\sudo-app\`

---

## Project Structure

```
D:\sudo-app\
├── lib/
│   ├── supabase.ts          # Supabase client init (AsyncStorage session)
│   └── api/
│       ├── _xp.ts           # XP constants + addXP helper (shared across API files)
│       ├── auth.ts          # Auth + profile functions (6 functions)
│       ├── posts.ts         # Posts, likes, comments (12 functions)
│       ├── groups.ts        # Groups + DMs (7 functions)
│       ├── messages.ts      # Messaging (4 functions)
│       ├── location.ts      # Location, landmarks, exploration (11 functions)
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
- `lib/api/verification.ts` — Offer verification API (Module 7)

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

-- landmarks: validated place_type (code uses 'coffee_shop', not 'cafe')
place_type CHECK (place_type IN ('library', 'gym', 'coffee_shop', 'dining', 'other'))

-- offer_verifications: one pending per user
CREATE UNIQUE INDEX one_pending_per_user ON offer_verifications(user_id) WHERE status = 'pending'

-- explorations: one record per user+landmark
UNIQUE(user_id, landmark_id)

-- landmark_cache_zones: one record per grid point
UNIQUE(latitude, longitude)
```

### Database Functions & Triggers (PostgreSQL)

| Function | Security | Trigger / Call | Purpose |
|----------|----------|----------------|---------|
| `handle_new_user()` | DEFINER | AFTER INSERT ON auth.users | Auto-create profile row on registration |
| `reassign_group_owner()` | DEFINER | BEFORE DELETE ON profiles | Transfer group ownership when user deletes account |
| `add_xp(p_user_id, p_xp)` | DEFINER | RPC via supabase.rpc() | Atomic XP increment + level recalculation. No race condition. Formula: `pet_xp = pet_xp + p_xp, pet_level = floor((pet_xp + p_xp) / 100) + 1` |
| `get_weekly_rankings(p_university)` | DEFINER | RPC via supabase.rpc() | Aggregate weekly rankings, validates caller is edu_verified + same university |
| `update_likes_count()` | — | AFTER INSERT OR DELETE ON likes | Auto-update `posts.likes_count` |
| `update_comments_count()` | — | AFTER INSERT OR DELETE ON comments | Auto-update `posts.comments_count` |
| `update_members_count()` | DEFINER | AFTER INSERT ON group_members (on_group_member_insert) + AFTER DELETE ON group_members (on_group_member_delete) | Auto-update `groups.members_count` (+1 on INSERT, `greatest(0, count-1)` on DELETE) |

### Realtime Tables
`messages`, `posts`, `likes`, `comments`, `user_locations`

---

## lib/api/_xp.ts

Centralizes all XP constants and the shared `addXP` helper. Imported by `posts.ts`, `messages.ts`, and `location.ts`.

### Constants
```typescript
POST_XP = 5                    // XP awarded per post created
COMMENT_XP = 3                 // XP awarded per comment created
POST_COMMENT_DAILY_CAP = 20    // Max XP/day from posts + comments combined
MESSAGE_THRESHOLD = 20         // Messages/day needed to earn message XP
MESSAGE_XP = 10                // XP awarded once per day when MESSAGE_THRESHOLD is crossed
FOREGROUND_XP_PER_HOUR = 5    // XP per hour the app is in foreground

EXPLORATION_XP: Record<place_type, number> = {
  library:     15,
  gym:         15,
  coffee_shop: 10,
  dining:      10,
  other:       8,
}
```

### Internal Helpers

#### `getTodayStart() → string`
Returns today's date at 00:00:00 as a UTC ISO string, using **Pacific Time (America/Los_Angeles)** as the reference timezone. Daily XP cap resets at midnight PT, consistent with `getWeekStart()` in `location.ts`.

Implementation: `new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))` → zero out hours → construct `${y}-${m}-${d}T00:00:00.000Z`.

#### `addXP(userId, xp) → Promise<void>`
Calls `supabase.rpc('add_xp', { p_user_id: userId, p_xp: xp })`.

The DB function performs a single atomic UPDATE:
```sql
UPDATE profiles
SET pet_xp = pet_xp + p_xp,
    pet_level = floor((pet_xp + p_xp) / 100) + 1
WHERE id = p_user_id;
```

**No read-then-write.** Eliminates the previous race condition where two concurrent XP events could both read the same stale value and one increment would be lost.

**Level formula:** `floor(xp / 100) + 1` — 100 XP per level, no upper cap.

---

## lib/api/auth.ts

### Imports & Dependencies
```typescript
import { supabase } from '../supabase'
```

### Types Defined Here
- `Profile` — complete profile interface (all columns + `active_title: string | null` joined from explorations)
- `ProfileUpdate` — `Partial<Pick<Profile, updatable fields>>`

---

#### `signUp(email, password) → { userId, error }`

Calls `supabase.auth.signUp()`. On success, `handle_new_user` DB trigger auto-inserts into `profiles`.

**Branches:**
- Success → `{ userId: string, error: null }`
- Failure → `{ userId: null, error: message }`

---

#### `signIn(email, password) → { userId, error }`

Calls `supabase.auth.signInWithPassword()`.

**Branches:**
- Success → `{ userId: string, error: null }`
- Failure → `{ userId: null, error: message }`

---

#### `signOut() → { error }`

Calls `supabase.auth.signOut()`.

---

#### `getProfile(userId?) → Profile | null`

**Logic:**
1. `getUser()` — must be logged in
2. `targetId = userId ?? user.id`
3. `isSelf = targetId === user.id`
4. `SELECT * FROM profiles WHERE id = targetId`
5. `SELECT active_title FROM explorations WHERE user_id = targetId AND active_title IS NOT NULL LIMIT 1` — `.maybeSingle()`
6. If self → return `{ ...data, active_title }` (no filtering)
7. If other → apply privacy filter (see below)

**Privacy filter for other users:**
```
Always null: personal_email, personal_email_verified, edu_email, region,
             location_sharing, ranking_opt_in, ranking_identity_mode
Always false: show_date_of_birth, show_nationality, show_qr_code
  (TD-5: viewer should not see the target's privacy toggle states)
Conditional:
  date_of_birth  → only if show_date_of_birth === true
  nationality    → only if show_nationality === true
  qr_code_url    → only if show_qr_code === true

profile_visibility switch:
  'real_only':
    null: pet_name, pet_avatar_url, pet_bio, pet_level, pet_xp

  'pet_only':
    null: real_name, avatar_url, bio, university,
          date_of_birth, nationality, qr_code_url
    (TD-4: pet_only hides all real-identity fields;
     university also hidden — a pet-only user's university
     should not be inferrable on public posts)

  'real_with_pet': no additional filtering
```

**Branches:**
- Not logged in → return null
- Self → return full Profile (including active_title)
- Other → return filtered Profile (active_title always included regardless of visibility mode)

---

#### `getMyTitles() → string[]`

`SELECT titles_earned FROM explorations WHERE user_id = auth.uid()`
Flattens all arrays, deduplicates via Set.

**Returns:** deduplicated `string[]` of all earned titles across all landmarks.

---

#### `updateProfile(fields: ProfileUpdate) → { error }`

`UPDATE profiles SET ...fields WHERE id = auth.uid()`

**Updatable fields:** `real_name`, `bio`, `avatar_url`, `date_of_birth`, `nationality`, `region`, `university`, `personal_email`, `edu_email`, `pet_name`, `pet_avatar_url`, `pet_bio`, `identity_mode`, `location_sharing`, `ranking_opt_in`, `ranking_identity_mode`, `profile_visibility`, `show_date_of_birth`, `show_nationality`, `show_qr_code`

**Not updatable via this function:** `id`, `sudo_id`, `edu_verified`, `personal_email_verified`, `pet_level`, `pet_xp`, `qr_code_url`, `created_at` — system-managed.

---

## lib/api/posts.ts

### Types Defined Here
- `Post` — post with joined author info + `liked_by_me`
- `Comment` — comment with joined author info

### Visibility Values
```typescript
'logged_in' | 'university' | 'friends' | 'specific_friends' | 'private'
```

### Internal Helpers

#### `extractStoragePath(url, bucket) → string | null`
Parses a Supabase Storage public URL to extract the relative file path. Used in `deletePost` and `editPost` for Storage cleanup.

#### `getBlockedIds(userId) → Promise<Set<string>>`
Fetches both directions of blocks in a `Promise.all`:
1. `SELECT blocked_id FROM blocked_users WHERE blocker_id = userId`
2. `SELECT blocker_id FROM blocked_users WHERE blocked_id = userId`

Returns `Set<string>` containing all users to exclude from feed/comments. Shared by `getFeed`, `getComments`, and `getUserPosts`.

---

#### `getFeed(options?) → { data: Post[], error: string | null }`

**Query:**
```
SELECT posts.*, profiles!(posts_user_id_fkey)(real_name, pet_name, avatar_url, pet_avatar_url)
FROM posts
[WHERE visibility = options.visibility]
[WHERE created_at < options.before]
[WHERE user_id NOT IN blockedIds]
ORDER BY created_at DESC
LIMIT options.limit (default 20)
```
RLS on posts handles visibility filtering automatically (university match, friendship check, post_viewers check).

**Note:** `university` is NOT included in the profiles join — it was removed because `.eq('profiles.university', x)` filtered the join result but not the parent post rows, causing incorrect behavior.

**Block filtering (runs before query):**
`getBlockedIds(user.id)` → if set non-empty, appends `.not('user_id', 'in', '(...)')` to query.

**Then:** batch fetch `SELECT post_id FROM likes WHERE user_id = auth.uid() AND post_id IN (postIds)` → builds `likedSet`.

**Author name/avatar resolution:**
```typescript
author_name = identity_mode === 'real' ? profile.real_name : profile.pet_name
author_avatar_url = identity_mode === 'real' ? profile.avatar_url : profile.pet_avatar_url
```

**Branches:**
- No visibility filter → all RLS-visible posts minus blocked users
- `visibility = 'university'` → RLS checks university match server-side
- `visibility = 'friends'` → RLS checks friendships table server-side
- `visibility = 'specific_friends'` → RLS checks post_viewers table server-side
- `before` provided → cursor pagination (older posts)
- Not logged in → `{ data: [], error: 'Not authenticated' }`
- DB error → `{ data: [], error: message }`

---

#### `createPost(content, identityMode, imageUrl?, visibility?) → { postId, error }`

`INSERT INTO posts` — visibility defaults to `'logged_in'`.

**Post-creation for specific_friends:** caller must follow up with `addPostViewer()` for each friend.

**XP logic (marginal diff method):**
```typescript
// p = today's post count (including this post), c = today's comment count
const xpAfter  = Math.min(p * POST_XP + c * COMMENT_XP, POST_COMMENT_DAILY_CAP)
const xpBefore = Math.min((p - 1) * POST_XP + c * COMMENT_XP, POST_COMMENT_DAILY_CAP)
if (xpAfter > xpBefore) await addXP(user.id, xpAfter - xpBefore)
```
Cap ensures shared daily limit across posts and comments. Skipping over the cap still awards correct partial XP.

---

#### `deletePost(postId) → { error }`

1. `SELECT image_url FROM posts WHERE id = postId`
2. `DELETE FROM posts WHERE id = postId` (RLS: only owner)
3. If `image_url` exists → `supabase.storage.from('post-images').remove([path])`

**Side effects:** cascades delete likes, comments, post_viewers.

---

#### `toggleLike(postId) → { liked, error }`

1. `SELECT id FROM likes WHERE post_id = postId AND user_id = auth.uid()` (`.maybeSingle()`)
2. If exists → `DELETE FROM likes`
3. If not exists → `INSERT INTO likes`

`likes_count` is updated automatically by `on_like_change` DB trigger (AFTER INSERT OR DELETE ON likes). No manual count update in JS.

---

#### `getComments(postId) → { data: Comment[], error: string | null }`

`SELECT comments.*, profiles!comments_user_id_fkey(...) WHERE post_id = postId ORDER BY created_at ASC`

**Block filtering:** same `getBlockedIds` pattern as `getFeed`.

**Branches:**
- Not logged in → `{ data: [], error: 'Not authenticated' }`
- DB error → `{ data: [], error: message }`
- Success → `{ data: Comment[], error: null }`

---

#### `createComment(postId, content, identityMode) → { commentId, error }`

`INSERT INTO comments`. `comments_count` updated by `on_comment_change` DB trigger.

**XP logic (marginal diff method):**
```typescript
// p = today's post count, c = today's comment count (including this comment)
const xpAfter  = Math.min(p * POST_XP + c * COMMENT_XP, POST_COMMENT_DAILY_CAP)
const xpBefore = Math.min(p * POST_XP + (c - 1) * COMMENT_XP, POST_COMMENT_DAILY_CAP)
if (xpAfter > xpBefore) await addXP(user.id, xpAfter - xpBefore)
```
Shares the same `POST_COMMENT_DAILY_CAP` as `createPost`.

---

#### `deleteComment(commentId) → { error }`

`DELETE FROM comments WHERE id = commentId` (RLS: only owner)
`comments_count` decremented by `on_comment_change` DB trigger.

---

#### `editPost(postId, content, imageUrl?) → { error }`

1. `SELECT image_url FROM posts WHERE id = postId` (RLS: only owner can read own posts via `.maybeSingle()`)
2. `UPDATE posts SET content, edited_at = now() [+ image_url if provided] WHERE id = postId`
3. Image handling:
   - `imageUrl = undefined` → no change to `image_url` column
   - `imageUrl = null` → `image_url = null` + delete old file from Storage
   - `imageUrl = new string` → `image_url = new string` + delete old file from Storage (if different)

---

#### `editComment(commentId, content) → { error }`

`UPDATE comments SET content, edited_at = now() WHERE id = commentId`
RLS: owner only. `identity_mode` is immutable.

---

#### `addPostViewer(postId, friendId) → { error }`

`INSERT INTO post_viewers (post_id, user_id=friendId)`
RLS: only post owner can insert.

---

#### `removePostViewer(postId, friendId) → { error }`

`DELETE FROM post_viewers WHERE post_id = postId AND user_id = friendId`
RLS: only post owner can delete.

---

#### `getUserPosts(userId, options?) → { data: Post[], error: string | null }`

**Logic:**
1. `getUser()` — must be logged in
2. `getBlockedIds(user.id)` — if `userId` is in the blocked set, return `{ data: [], error: null }` immediately (shows empty list, not an error)
3. Query: `SELECT posts.*, profiles!posts_user_id_fkey(...) WHERE user_id = userId ORDER BY created_at DESC LIMIT limit`
4. Cursor pagination: `if (before) query = query.lt('created_at', before)`
5. Batch fetch `liked_by_me` same as `getFeed`

**RLS handles all visibility filtering automatically:**
- Self-query: returns all posts including `private` (RLS: `auth.uid() = user_id`)
- Other user: returns only posts visible to the current user per visibility rules

**Branches:**
- Blocked (either direction) → `{ data: [], error: null }`
- Not logged in → `{ data: [], error: 'Not authenticated' }`
- DB error → `{ data: [], error: message }`
- Success → `{ data: Post[], error: null }`

**Default limit:** 20. Cursor: pass `created_at` of the last item in previous page as `before`.

---

## lib/api/groups.ts

### Types Defined Here
- `Group` — groups table row
- `CreateGroupData` — input for createGroup

### Design Notes
- `members_count` is maintained entirely by DB triggers (`on_group_member_insert` / `on_group_member_delete`). No JS-layer count updates anywhere. JS functions return hardcoded counts immediately for optimistic UI only.
- No `syncMembersCount()` function exists — it was removed when triggers were added.

---

#### `createGroup(data) → Group | null`

1. `INSERT INTO groups` with `chat_type='group'`, `members_count: 0`
2. `INSERT INTO group_members` with `role='admin'`, `user_id=auth.uid()`
3. DB trigger fires → `groups.members_count` becomes 1
4. Returns `{ ...group, members_count: 1 }` (hardcoded for immediate UI use)

---

#### `getMyGroups() → Group[]`

Single-query join:
```
SELECT groups(*) FROM group_members WHERE user_id = auth.uid()
```
Returns all groups (both `chat_type='group'` and `'direct'`) via Supabase nested select.

---

#### `joinGroup(groupId) → { error }`

`INSERT INTO group_members (role='member')`
DB trigger fires → `members_count + 1`

**Branches:**
- Success → `{ error: null }`
- Already a member → UNIQUE constraint error, returned as `{ error: message }`
- `edu_verified` group, user not verified → RLS rejects

---

#### `leaveGroup(groupId) → { error }`

1. `SELECT created_by FROM groups WHERE id = groupId`
2. `DELETE FROM group_members WHERE group_id = groupId AND user_id = auth.uid()`
3. DB trigger fires → `members_count - 1`
4. If leaver was `created_by`:
   - `SELECT user_id FROM group_members WHERE group_id = groupId ORDER BY joined_at ASC LIMIT 1` (`.maybeSingle()`)
   - `UPDATE groups SET created_by = nextMember?.user_id ?? null`
5. If no members remain → group is preserved as empty (design: retained for admin content review)

---

#### `searchGroups(keyword, university?) → Group[]`

```
WHERE is_searchable=true AND chat_type='group' AND members_count>=3
AND group_type IN ('open','official','edu_verified')
AND name ILIKE '%keyword%'
```
If `university` provided → append OR filter: open/official types unrestricted, `edu_verified` requires `university = ?`.

---

#### `createDirectMessage(friendId) → Group | null`

**Duplicate detection (2 parallel queries, no loop):**
```typescript
Promise.all([
  SELECT group_id FROM group_members WHERE user_id=auth.uid() AND groups.chat_type='direct',
  SELECT group_id FROM group_members WHERE user_id=friendId AND groups.chat_type='direct'
])
// JS intersection of both group_id sets → sharedGroupId
```

If `sharedGroupId` found → `SELECT * FROM groups WHERE id = sharedGroupId` → return existing group.

If not found:
1. `INSERT INTO groups` with `chat_type='direct'`, `group_type='direct'`, `members_count: 0`
2. `INSERT INTO group_members` × 2 (both users)
3. DB triggers fire → `members_count` becomes 2
4. Returns `{ ...group, members_count: 2 }` (hardcoded for immediate UI use)

---

#### `removeMember(groupId, targetUserId) → { error }`

1. `SELECT created_by FROM groups WHERE id = groupId`
2. If `created_by !== auth.uid()` → `{ error: 'Permission denied' }`
3. If `targetUserId === auth.uid()` → `{ error: 'Cannot remove yourself' }`
4. `DELETE FROM group_members WHERE group_id = groupId AND user_id = targetUserId`
5. DB trigger fires → `members_count - 1`

---

## lib/api/messages.ts

### Types Defined Here
- `Message` — messages table row + `author_name: string | null` + `author_avatar_url: string | null`
  - Both fields are resolved at query/fetch time based on `identity_mode`
  - Realtime-pushed messages: author fields are populated via an async profile lookup inside the callback

---

#### `getMessages(groupId, limit=30, before?) → Message[]`

```
SELECT messages.*, profiles!messages_user_id_fkey(real_name, pet_name, avatar_url, pet_avatar_url)
FROM messages WHERE group_id = groupId
[AND created_at < before]
ORDER BY created_at DESC LIMIT limit
```

Maps to `Message[]` resolving `author_name`/`author_avatar_url` from `identity_mode`. No DELETE policy by design.

---

#### `sendMessage(groupId, content, identityMode, imageUrl?) → { data: Message | null, error: string | null }`

`INSERT INTO messages` → returns inserted row as `data`.

**XP logic (diff method):**
```typescript
// msgToday = count of messages sent today by this user (including this one)
const xpBefore = (msgToday - 1) >= MESSAGE_THRESHOLD ? MESSAGE_XP : 0
const xpAfter  = msgToday >= MESSAGE_THRESHOLD ? MESSAGE_XP : 0
if (xpAfter > xpBefore) await addXP(user.id, MESSAGE_XP)
```
Fires exactly once per day — when `msgToday` first reaches `MESSAGE_THRESHOLD` (20). Sending the 21st+ message does not re-trigger XP.

**Branches:**
- Not logged in → `{ data: null, error: 'Not authenticated' }`
- DB error → `{ data: null, error: message }`
- Success → `{ data: Message, error: null }`

---

#### `subscribeToMessages(groupId, onMessage) → () => void`

Supabase Realtime channel: `messages:${groupId}`
Event: INSERT on `messages` table, filter: `group_id=eq.${groupId}`

**Profile lookup for Realtime payloads:**
Since Realtime INSERT events are raw DB rows without JOIN data, the callback performs an async profile fetch:
```typescript
async (payload) => {
  const msg = payload.new
  if (msg.user_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('real_name, pet_name, avatar_url, pet_avatar_url')
      .eq('id', msg.user_id).single()
    // resolve author_name / author_avatar_url from identity_mode
  }
  onMessage({ ...msg, author_name, author_avatar_url })
}
```

Returns `() => supabase.removeChannel(channel)` — must be called on unmount to prevent memory leaks.

---

#### `editMessage(messageId, content) → { error }`

`UPDATE messages SET content, edited_at = now() WHERE id = messageId`
RLS: owner only. `identity_mode` is immutable.

---

## lib/api/location.ts

### Types Defined Here
- `LocationSharingMode` — `'precise' | 'fuzzy' | 'off'`
- `Coordinate` — `{ latitude, longitude }`
- `FriendLocation` — location + display info
- `CachedLandmark` — landmark from DB
- `DiscoverResult` — XP, title, visit info
- `RankingEntry` / `WeeklyRankings` — ranking structures

### Internal Helpers
- `applyFuzzyOffset(coord)` — rounds to nearest 0.005° grid (~555m cells). Uses `Math.round(val / 0.005) * 5 / 1000` to avoid floating point precision issues.
- `getWeekStart()` — returns most recent Monday 00:00 PT as UTC Date object. Same PT timezone as `getTodayStart()`.
- `clampMinutesSpent(claimed, prevWeekly, lastVisitedAt, isNewWeek)` — anti-cheat
- `getPlaceRadius(types)` — Google types → radius_meters
- `getPlaceType(types)` — Google types → SUDO place_type (`'coffee_shop'` for cafe/bakery, not `'cafe'`)

### Constants
```typescript
CACHE_RADIUS_METERS = 500        // Google Places search radius
CACHE_EXPIRY_DAYS = 30           // landmark cache TTL
MAX_MINUTES_PER_CALL = 480       // anti-cheat hard cap (8 hours)
TIMESTAMP_TOLERANCE = 10         // anti-cheat grace minutes
```

---

#### `updateMyLocation(coord) → void`

1. `SELECT location_sharing FROM profiles WHERE id = auth.uid()`
2. `'off'` → `DELETE FROM user_locations WHERE user_id = auth.uid()`
3. `'fuzzy'` → `coord = applyFuzzyOffset(coord)` → `UPSERT user_locations`
4. `'precise'` → `UPSERT user_locations` with raw coord

---

#### `getFriendLocations() → FriendLocation[]`

1. SELECT friendships WHERE status='accepted' AND (requester_id=uid OR addressee_id=uid)
2. Derive `friendIds`
3. SELECT user_locations.* + `profiles!inner(real_name, pet_name, avatar_url, pet_avatar_url, identity_mode, location_sharing)` WHERE user_id IN (friendIds)
4. Filter: `location_sharing !== 'off'`
5. Map: `display_name = identity_mode==='pet' ? pet_name ?? real_name : real_name ?? pet_name`

---

#### `subscribeToFriendLocations(friendIds, onUpdate) → Promise<() => void>`

1. Batch fetch profiles for all `friendIds` → build `profileCache` (Map<userId, profile>)
2. Subscribe to `postgres_changes` on `user_locations`, filter: `user_id=in.(friendIds)`
3. On event: lookup profile from cache, skip if `location_sharing='off'`, call `onUpdate()`
4. Return `() => supabase.removeChannel(channel)`

**Tech Debt:** `profileCache` built once at subscribe time; profile changes (identity_mode, location_sharing) during subscription require re-subscribe to take effect.

---

#### `cacheNearbyPlaces(coord) → Promise<CachedLandmark[]>`

**Grid-based caching:** coords snapped to nearest 0.005° grid point via `applyFuzzyOffset`. All users in the same ~555m cell share one cache record and one Google API call.

**Cache hit path:**
1. Snap coord to grid point
2. `SELECT id FROM landmark_cache_zones WHERE expires_at >= now() AND latitude = snapped.lat AND longitude = snapped.lng` (exact match)
3. If found → `SELECT * FROM landmarks WHERE expires_at >= now() AND lat/lng within ±0.005`

**Cache miss path:**
1. Google Places Nearby Search centered on snapped grid point (radius 500m)
2. Map results via `getPlaceType()` / `getPlaceRadius()`
3. `UPSERT landmarks ON CONFLICT place_id DO NOTHING`
4. `UPSERT landmark_cache_zones ON CONFLICT (latitude, longitude)` → refreshes `expires_at`
5. Return inserted landmarks

**Tech Debt (TD-6):** `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` exposed client-side.

---

#### `discoverLandmark(coord, minutesSpent) → Promise<DiscoverResult | null>`

**Flow:**
1. `cacheNearbyPlaces(coord)` → get nearby landmarks
2. Find landmark where Euclidean distance (with latitude cosine correction) ≤ `radius_meters`
3. `SELECT * FROM explorations WHERE user_id=uid AND landmark_id=landmark.id` (`.maybeSingle()`)
4. `weekStart = getWeekStart()`
5. `needsReset = !existing || new Date(existing.week_start_date) < weekStart`

**Branch A — No existing record (first ever visit):**
```
safeMinutes = clampMinutesSpent(minutesSpent, 0, null, false)
isFirstVisit = true
xpEarned = EXPLORATION_XP[placeType]   // library/gym=15, coffee_shop/dining=10, other=8
INSERT explorations (visit_count=1, ...)
addXP(uid, xpEarned)
```

**Branch B — Existing record (return visit):**
```
prevWeeklyTime = needsReset ? 0 : existing.weekly_time_spent
safeMinutes = clampMinutesSpent(minutesSpent, prevWeeklyTime, existing.last_visited_at, needsReset)
newWeeklyTime = safeMinutes
newVisitCount = existing.visit_count + 1
xpEarned = 0  (XP only on first visit)

Title unlock:
  if newVisitCount >= 7  && !titles.includes(junior) → unlock junior title
  if newVisitCount >= 30 && !titles.includes(senior) → unlock senior title

UPDATE explorations SET ...
  WHERE id=existing.id AND last_visited_at=existing.last_visited_at  ← optimistic lock
  (if 0 rows updated → concurrent conflict → return null)
```

**Title table:**
```
library:     { junior: 'Bookworm',      senior: 'Library King'     }
dining:      { junior: 'Big Eater',     senior: 'Dining Hall King' }
gym:         { junior: 'Gym Newbie',    senior: 'Gym Fanatic'      }
coffee_shop: { junior: 'Coffee Lover',  senior: 'Coffee Addict'    }
other:       { junior: 'Explorer',      senior: 'Master Explorer'  }
```

**clampMinutesSpent anti-cheat:**
```
If !lastVisitedAt || isNewWeek → min(max(0, claimed), 480)
Else:
  delta = claimed - prevWeeklyTime
  elapsedMinutes = (now - lastVisitedAt) / 60000
  safeDelta = min(delta, 480, elapsedMinutes + 10)
  return prevWeeklyTime + safeDelta
```

**Null returns:** not logged in, no nearby landmark, coord not within any landmark's radius, optimistic lock conflict.

---

#### `setActiveTitle(title: string | null) → Promise<void>`

**Note:** function signature is `(title)` only — no `explorationId` parameter. The function finds the correct exploration internally.

1. `UPDATE explorations SET active_title = null WHERE user_id = auth.uid()` — clear all active titles first
2. If `title === null` → done (unequip)
3. `SELECT id, titles_earned FROM explorations WHERE user_id = auth.uid()`
4. Find exploration where `titles_earned.includes(title)`
5. If not found → silent return (security: cannot equip unearned title)
6. `UPDATE explorations SET active_title = title WHERE id = exploration.id AND user_id = auth.uid()`

---

#### `saveExploredPath(coordinates) → void`

`INSERT INTO explored_paths (user_id, coordinates)` — coordinates is JSONB `[{lat,lng},...]`.
Frontend is responsible for RDP simplification before calling.

---

#### `getExploredPaths() → {lat,lng}[][]`

`SELECT coordinates FROM explored_paths WHERE user_id = auth.uid()`
Returns array of path segments.

---

#### `getWeeklyRankings(university) → WeeklyRankings`

`supabase.rpc('get_weekly_rankings', { p_university: university })`

DB function validates: caller must have `edu_verified=true AND university=p_university`. Otherwise returns empty.

Filters: `place_type IN ('library', 'coffee_shop', 'gym', 'dining')` — `'other'` excluded from rankings.

Groups rows by `place_type` into `WeeklyRankings` object (top 3 per type).

---

#### `setRankingPreferences(optIn, identityMode) → void`

`UPDATE profiles SET ranking_opt_in=optIn, ranking_identity_mode=identityMode WHERE id=auth.uid()`

---

#### `addForegroundXP() → Promise<void>`

Calls `addXP(uid, FOREGROUND_XP_PER_HOUR)` (5 XP).

**Caller contract:** Frontend calls once per hour while app is in foreground. Backend performs no time validation — no daily cap by design (users who keep the app open are rewarded proportionally).

---

## lib/api/friends.ts

### Types Defined Here
- `FriendProfile` — friendship_id + friend's profile fields
- `FriendRequest` — friendship_id + profile fields + created_at
- `UserSearchResult` — profile fields (no friendship_id)
- `BlockedUser` — blocked_id, sudo_id, real_name, avatar_url
- `FriendshipStatus` — `'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'blocked'`

### Design Decisions
- `blockUser()` deletes ALL friendship records (pending and accepted) between the two users
- `getFriendshipStatus()` returns `'none'` when the other user has blocked you (does not expose the block)
- `searchUsers()` filters both directions of blocks using two parallel queries
- `cancelRequest()` is separate from `removeFriend()` — different security semantics

---

#### `sendFriendRequest(addresseeId) → { error }`

1. Check `blocked_users` for any block in either direction (one OR query)
2. If block found → `{ error: '无法发送申请' }` (same message regardless of direction)
3. Check `friendships` for reverse pending request (addresseeId → uid)
4. If found → `{ error: '对方已向你发送了好友申请，请前往申请列表接受' }`
5. `INSERT INTO friendships (requester_id=uid, addressee_id)`

---

#### `acceptFriendRequest(friendshipId) → { error }`

`UPDATE friendships SET status='accepted' WHERE id=friendshipId`
RLS: only addressee can update.

---

#### `declineFriendRequest(friendshipId) → { error }`

`DELETE FROM friendships WHERE id=friendshipId AND status='pending'`
`status='pending'` filter prevents accidentally deleting an accepted friendship.

---

#### `cancelRequest(friendshipId) → { error }`

`DELETE FROM friendships WHERE id=friendshipId AND requester_id=uid AND status='pending'`
Extra `requester_id=uid` ensures only the sender can cancel.

---

#### `removeFriend(friendshipId) → { error }`

`DELETE FROM friendships WHERE id=friendshipId`
RLS: either party can delete.

---

#### `blockUser(targetId) → { error }`

1. `INSERT INTO blocked_users (blocker_id=uid, blocked_id=targetId)`
2. If INSERT fails → return error (already blocked)
3. `DELETE FROM friendships WHERE (uid↔targetId in either direction)` — no status filter, deletes all records

---

#### `unblockUser(targetId) → { error }`

`DELETE FROM blocked_users WHERE blocker_id=uid AND blocked_id=targetId`

---

#### `getFriends() → FriendProfile[]`

```
SELECT friendships (id, requester_id, addressee_id)
  + requester:profiles!friendships_requester_id_fkey (id, sudo_id, real_name, pet_name, avatar_url, pet_avatar_url, university, profile_visibility, identity_mode)
  + addressee:profiles!friendships_addressee_id_fkey (same fields)
WHERE status='accepted' AND (requester_id=uid OR addressee_id=uid)
```
Map: `friend = requester_id === uid ? addressee : requester`

---

#### `getPendingRequests() → FriendRequest[]`

`SELECT friendships WHERE status='pending' AND addressee_id=uid`
JOIN `requester:profiles!friendships_requester_id_fkey`

---

#### `getSentRequests() → FriendRequest[]`

`SELECT friendships WHERE status='pending' AND requester_id=uid`
JOIN `addressee:profiles!friendships_addressee_id_fkey`

---

#### `getFriendshipStatus(targetId) → FriendshipStatus`

1. `SELECT blocked_users WHERE blocker_id=uid AND blocked_id=targetId` → if found, return `'blocked'`
2. `SELECT friendships WHERE (uid↔targetId either direction)` (`.maybeSingle()`)
3. No record → `'none'`
4. `status='accepted'` → `'accepted'`
5. `requester_id=uid` → `'pending_sent'`
6. else → `'pending_received'`

**Note:** Does NOT check if targetId has blocked uid — returns `'none'` in that case.

---

#### `searchUsers(keyword) → UserSearchResult[]`

1. `Promise.all`:
   - `SELECT blocked_id FROM blocked_users WHERE blocker_id=uid`
   - `SELECT blocker_id FROM blocked_users WHERE blocked_id=uid`
2. `excludeIds = [uid, ...iBlocked, ...blockedMe]`
3. `SELECT profiles WHERE (sudo_id=keyword OR real_name ILIKE '%keyword%') AND id NOT IN (excludeIds) LIMIT 20`

`sudo_id` exact match OR `real_name` case-insensitive partial match. Does NOT search `pet_name`.

---

#### `getBlockedUsers() → BlockedUser[]`

`SELECT blocked_users WHERE blocker_id=uid`
JOIN `blocked:profiles!blocked_users_blocked_id_fkey (sudo_id, real_name, avatar_url)`

---

## Missing API File: lib/api/verification.ts

**Status:** Not yet created. `offer_verifications` table exists in DB. Planned for Module 7 (tasks 110–114).

---

## Known Technical Debt

| ID | Severity | Location | Issue | Status |
|----|----------|----------|-------|--------|
| TD-1 | HIGH | `location.ts:discoverLandmark` | Client-supplied GPS coords trusted; cheat by sending fake coords to earn XP/titles | Open |
| TD-11 | LOW | `location.ts:addForegroundXP` | Frontend controls call frequency; malicious client can call more than once/hour | Open (intentional — no cap by design) |
| TD-6 | MED | `location.ts:cacheNearbyPlaces` | `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` exposed client-side | Open |
| TD-2 | MED | `posts.ts` | `likes_count`/`comments_count` read-then-write race condition | RESOLVED — DB triggers `on_like_change`/`on_comment_change` |
| TD-3 | MED | App layer | Blocked users not filtered in feed/comments | RESOLVED — `getBlockedIds()` helper used in `getFeed`, `getComments`, `getUserPosts` |
| TD-4 | MED | `auth.ts:getProfile` | `pet_only` + `show_date_of_birth=true` still returned `date_of_birth` | RESOLVED — `pet_only` now nulls `date_of_birth`, `nationality`, `qr_code_url`, `university` |
| TD-5 | MED | `auth.ts:getProfile` | Privacy meta-fields (`show_*`) exposed via `...p` spread to third parties | RESOLVED — `show_*` set to `false` when returning other users' profiles |
| TD-7 | LOW | `groups.ts:createDirectMessage` | N+1 loop checking for existing DM conversation | RESOLVED — 2 parallel queries + JS set intersection |
| TD-8 | MED | `groups.ts` | `members_count` read-then-write race condition via `syncMembersCount()` | RESOLVED — DB triggers `on_group_member_insert`/`on_group_member_delete` |
| TD-9 | LOW | `location.ts:cacheNearbyPlaces` | Unlimited INSERT per user into `landmark_cache_zones` | RESOLVED — UNIQUE(latitude, longitude) + UPSERT |
| TD-10 | LOW | `user_locations RLS` | `location_sharing='off'` only filtered JS-side | RESOLVED — RLS `friends_can_read` now requires `location_sharing IN ('precise', 'fuzzy')` |
| TD-12 | MED | `_xp.ts:addXP` | Read-then-write race condition in XP increment | RESOLVED — atomic RPC `add_xp()` |

---

## Migration Notes

### 25_user_profile_table.sql
Defines `profiles` table, RLS policies, and the `add_xp` RPC function.
`add_xp(p_user_id uuid, p_xp integer)`: atomic `UPDATE profiles SET pet_xp = pet_xp + p_xp, pet_level = floor((pet_xp + p_xp) / 100) + 1`. SECURITY DEFINER.

### 27_groups_table.sql
Defines `groups`, `group_members`, `messages` tables and RLS policies.
Includes `update_members_count()` trigger function and two triggers:
- `on_group_member_insert` (AFTER INSERT) → `members_count + 1`
- `on_group_member_delete` (AFTER DELETE) → `members_count = greatest(0, members_count - 1)`

### 28_posts_table.sql
Defines `posts`, `likes`, `comments`, `post_viewers` tables and RLS policies.
Includes `on_like_change` trigger (AFTER INSERT OR DELETE ON likes → `UPDATE posts SET likes_count`).
Includes `on_comment_change` trigger (AFTER INSERT OR DELETE ON comments → `UPDATE posts SET comments_count`).

### 40_user_locations.sql
`friends_can_read` policy: SELECT allowed if accepted friendship exists AND `location_sharing IN ('precise', 'fuzzy')` from profiles. Location sharing enforcement at DB level.

### 45_weekly_rankings.sql
`get_weekly_rankings` RPC. Filters `place_type IN ('library', 'coffee_shop', 'gym', 'dining')` — uses `'coffee_shop'` (matching `getPlaceType()` output), not `'cafe'`.

### 46_landmark_cache_zones.sql
`UNIQUE(latitude, longitude)` enables UPSERT-based cache refresh.

---

## RLS Policy Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `profiles` | Any logged-in user | Own row only | Own row only | Own row only |
| `friendships` | Participants only | Requester = auth.uid() | Addressee only (accept) | Either participant |
| `blocked_users` | blocker OR blocked | blocker = auth.uid() | — | blocker = auth.uid() |
| `groups` | Members only (via group_members) | Authenticated | Members only | Owner only |
| `group_members` | Members of the group | Authenticated | — | Own row or group owner |
| `messages` | Group members | Group members | Own row | — (no delete) |
| `posts` | Visibility-based (complex) | Authenticated | Own row | Own row |
| `post_viewers` | Post owner | Post owner | — | Post owner |
| `likes` | Authenticated | Authenticated (own) | — | Own row |
| `comments` | Authenticated | Group/post members | Own row | Own row |
| `user_locations` | Self or accepted friends with sharing enabled | Own row | Own row | Own row |
| `explorations` | Own rows | Authenticated (own) | Own row | — |
| `explored_paths` | Own rows | Authenticated (own) | — | — |
| `landmarks` | Authenticated | Authenticated | Authenticated | — |
| `landmark_cache_zones` | Authenticated | Authenticated | Authenticated | — |
