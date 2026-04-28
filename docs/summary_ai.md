# SUDO App — AI Technical Reference
> For AI assistants working on this codebase | Updated April 2026 (v9)
> Base path: `D:\sudo-app\`

> **v9 (2026-04-17) major refactor**: 14 migrations rewritten with column-level
> security hardening, 15 SECURITY DEFINER RPCs introduced to centralize
> sensitive writes, and 4 latent BUGs fixed. See [TECH_DEBT.md](TECH_DEBT.md)
> for current TD list and [修复清单_2026-04-17.md](修复清单_2026-04-17.md) for
> per-issue change log.

---

## Project Structure

```
D:\sudo-app\
├── lib/
│   ├── supabase.ts          # Supabase client init (AsyncStorage session)
│   └── api/
│       ├── _xp.ts           # XP constants + addXP helper (shared across API files)
│       ├── auth.ts          # Auth + profile functions (6 functions)
│       ├── posts.ts         # Posts, likes, comments (13 functions)
│       ├── groups.ts        # Groups + DMs (8 functions, +transferGroupOwnership in v9)
│       ├── messages.ts      # Messaging (4 functions)
│       ├── location.ts      # Location, landmarks, exploration (11 functions)
│       └── friends.ts       # Friends, blocks, search (13 functions)
├── supabase/migrations/     # 14 SQL migration files (all executed in Supabase)
│   ├── 25_user_profile_table.sql   # v9: profiles + 9 RPCs (merged 54, 55)
│   ├── 26_friendships_table.sql    # v9: column-level UPDATE on status only
│   ├── 27_groups_table.sql         # v9: leave_group / transfer_group_ownership RPCs
│   ├── 28_posts_table.sql          # v9: is_post_viewer RPC, block filter in RLS
│   ├── 29_offer_verifications.sql  # v9: column-level INSERT
│   ├── 30_realtime_config.sql
│   ├── 35_storage_policies.sql
│   ├── 40_user_locations.sql       # v9: added 'mode' column
│   ├── 41_landmarks.sql            # v9: added (lat, lng) index
│   ├── 42_explorations.sql         # v9: discover_landmark / set_active_title RPCs (writes locked)
│   ├── 44_explored_paths.sql       # v9: bbox columns + auto-compute trigger
│   ├── 45_weekly_rankings.sql      # v9: removed pet_avatar_url leak
│   ├── 46_landmark_cache_zones.sql
│   └── 53_handle_new_user.sql
├── docs/
│   ├── TECH_DEBT.md          # Authoritative TD list (single source of truth)
│   ├── 修复清单_2026-04-17.md # Per-issue log of v9 refactor
│   ├── summary_human.md      # Plain-language doc for Ethan
│   └── summary_ai.md         # This file
├── App.tsx
└── app.json
```

**Removed in v9:**
- `54_profile_visibility.sql` — merged into 25
- `55_protect_profile_columns.sql` — merged into 25 (was a v9-stage patch)

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

**v9 design principle**: anything that touches a column the user is forbidden
from writing directly (e.g. `edu_verified`, `pet_xp`, `titles_earned`,
`weekly_time_spent`) goes through a SECURITY DEFINER RPC. Direct table writes
from authenticated clients are tightly scoped via column-level GRANT/REVOKE.

#### Privacy / Profile RPCs (v9)

| Function | Security | Purpose |
|----------|----------|---------|
| `get_my_profile()` | DEFINER | Returns full profile JSON for `auth.uid()` (all 28 fields including private ones). Replaces direct `select * from profiles` which would now fail due to revoked column-level SELECT. Used by `auth.ts getProfile(undefined)` and `location.ts updateMyLocation`. |
| `get_other_profile(target_id uuid)` | DEFINER | Returns target's profile JSON with privacy filter applied server-side: hides email/region/preferences entirely; respects target's `profile_visibility` (real_only/pet_only/real_with_pet) and `show_*` toggles for date_of_birth/nationality/qr_code. Used by `auth.ts getProfile(otherUserId)`. |
| `is_post_viewer(p_post_id uuid)` | DEFINER | Returns boolean. Bypasses `post_viewers` RLS for the `specific_friends` visibility check inside posts SELECT policy (without it, invitees could not view posts due to RLS recursion). |

#### Group ownership RPCs (v9)

| Function | Security | Purpose |
|----------|----------|---------|
| `leave_group(p_group_id uuid)` | DEFINER | Atomic: deletes caller's `group_members` row + auto-transfers `groups.created_by` to oldest remaining member if leaver was creator. Replaces JS `leaveGroup` which silently failed on the transfer UPDATE due to RLS WITH CHECK. |
| `transfer_group_ownership(p_group_id, p_new_owner_id uuid)` | DEFINER | Explicit transfer by current creator. Validates: caller is current creator, new owner is a member, not transferring to self. |

#### Exploration / XP RPCs (v9)

| Function | Security | Purpose |
|----------|----------|---------|
| `set_active_title(p_title text)` | DEFINER | Equip/unequip title with server-side validation that it's in `titles_earned`. Maintains "one active_title per user" invariant. Direct UPDATE on explorations is REVOKE'd, so this RPC is the only path. |
| `discover_landmark(p_landmark_id, p_lat, p_lng, p_minutes_spent)` | DEFINER | Atomic visit recording with anti-cheat: validates coord is within `landmark.radius_meters`, applies `clampMinutesSpent` (8h hard cap + elapsed-time check), optimistic lock, awards XP on first visit, unlocks junior (7 visits) / senior (30 visits) titles. Returns DiscoverResult JSON. |
| `add_xp(p_user_id uuid, p_xp integer)` | DEFINER | Atomic XP increment + level recalculation. Formula: `pet_xp = pet_xp + p_xp, pet_level = floor((pet_xp + p_xp) / 100) + 1` |
| `get_weekly_rankings(p_university text)` | DEFINER | Aggregate weekly rankings per place_type. Validates caller is edu_verified + same university. v9: removed `pet_avatar_url` from return (was leaking pet identity even when ranking_identity_mode='real'). |

#### Trigger functions (v9 unchanged from v7 except for being re-installed)

| Function | Trigger | Purpose |
|----------|---------|---------|
| `handle_new_user()` | AFTER INSERT ON auth.users | Auto-create profile row on registration |
| `reassign_group_owner()` | BEFORE DELETE ON profiles | Transfer group ownership when user is hard-deleted |
| `update_likes_count()` | AFTER INSERT OR DELETE ON likes | Maintain `posts.likes_count` |
| `update_comments_count()` | AFTER INSERT OR DELETE ON comments | Maintain `posts.comments_count` |
| `update_members_count()` | AFTER INSERT/DELETE ON group_members | Maintain `groups.members_count` |
| `compute_explored_path_bbox()` | BEFORE INSERT ON explored_paths | Auto-compute (min/max)\_(lat/lng) from `coordinates` JSONB array |

### Realtime Tables
`messages`, `posts`, `likes`, `comments`, `user_locations`

---

## lib/api/_xp.ts

Centralizes XP constants and the shared `addXP` helper. Imported by `posts.ts`, `messages.ts`, and `location.ts`.

### Constants
```typescript
POST_XP = 5                    // XP per post created (subject to daily cap)
COMMENT_XP = 3                 // XP per comment created (subject to daily cap)
POST_COMMENT_DAILY_CAP = 20    // Max XP/day from posts + comments combined
MESSAGE_THRESHOLD = 20         // Messages/day needed to earn message XP
MESSAGE_XP = 10                // Granted once/day when MESSAGE_THRESHOLD is crossed
FOREGROUND_XP_PER_HOUR = 5     // XP per hour app is in foreground (no daily cap by design)

// EXPLORATION_XP — reference values, NOT imported anywhere in JS post-v9.
// The actual XP grant happens inside discover_landmark RPC (migration 42),
// which hardcodes these same numbers. If you change here, also update SQL.
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

**v9 implementation: delegates to SECURITY DEFINER RPCs.** All privacy
filtering and active_title lookup is server-side, eliminating ~50 lines of
JS-layer logic and closing the bypass where direct SELECT could read other
users' private fields.

**Logic:**
```typescript
if (!userId || userId === auth.uid()) {
  return supabase.rpc('get_my_profile')      // Returns full profile JSON
}
const data = await supabase.rpc('get_other_profile', { target_id: userId })
// RPC omits never-shared fields (email/region/preferences). Fill with null/false
// to match Profile shape:
return { ...data, personal_email: null, ..., show_date_of_birth: false, ... }
```

**Privacy rules** (now enforced by `get_other_profile()` RPC, not JS):
- **Never returned to others**: `personal_email`, `edu_email`, `personal_email_verified`, `region`, `location_sharing`, `ranking_opt_in`, `ranking_identity_mode`, `show_date_of_birth`, `show_nationality`, `show_qr_code`
- **Conditional**: `date_of_birth` only if `show_date_of_birth=true` AND not `pet_only`; same pattern for `nationality` and `qr_code_url`
- **`profile_visibility = 'pet_only'`**: also nulls `real_name, bio, avatar_url, university` — pet-only user's real identity must remain inferrable
- **`profile_visibility = 'real_only'`**: nulls all `pet_*` fields
- **`real_with_pet`**: only the email/region/etc. blacklist applies; both identities visible
- `active_title` always returned (queried from explorations server-side)

**Why RPC instead of direct SELECT**: column-level SELECT GRANTs in migration
25 revoke `personal_email`, `edu_email`, `date_of_birth`, etc. from
`authenticated`. Even self cannot `SELECT *` from profiles directly — must go
through `get_my_profile()`. This makes the privacy contract enforceable at the
database layer, not just at the JS helper.

**Branches:**
- Not logged in → null
- Self (no arg or arg = auth.uid()) → calls `get_my_profile`
- Other user → calls `get_other_profile`
- RPC error or no data → null

---

#### `getMyTitles() → string[]`

`SELECT titles_earned FROM explorations WHERE user_id = auth.uid()`
Flattens all arrays, deduplicates via Set.

**Returns:** deduplicated `string[]` of all earned titles across all landmarks.

---

#### `updateProfile(fields: ProfileUpdate) → { error }`

`UPDATE profiles SET ...fields WHERE id = auth.uid()`

**v9 enforcement is at DB column-level GRANT (migration 25), not at TS type:**

**Updatable (column-level GRANT exists)**: `real_name`, `bio`, `avatar_url`, `qr_code_url`, `date_of_birth`, `nationality`, `region`, `university`, `personal_email`, `edu_email`, `pet_name`, `pet_avatar_url`, `pet_bio`, `identity_mode`, `location_sharing`, `ranking_opt_in`, `ranking_identity_mode`, `profile_visibility`, `show_date_of_birth`, `show_nationality`, `show_qr_code` (21 columns)

**Protected (no GRANT — UPDATE will fail with permission error)**:
- `edu_verified`, `university` (set by verify-offer Edge Function — TD-13 will trigger reset on university change)
- `personal_email_verified` (future email verification flow)
- `pet_xp`, `pet_level` (only `add_xp()` RPC writes these)
- `sudo_id`, `id`, `created_at` (immutable)

`ProfileUpdate` TypeScript type lists only the 21 updatable fields. If a malicious
client passes a protected column, the DB rejects with `permission denied for column X`.

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

**v9: thin wrapper over `leave_group(p_group_id)` RPC.** All work happens in
the SECURITY DEFINER function (migration 27).

```typescript
const { error } = await supabase.rpc('leave_group', { p_group_id: groupId })
return { error: error?.message ?? null }
```

**RPC logic:**
1. Determine if caller is the group's creator
2. `DELETE FROM group_members WHERE group_id = p_group_id AND user_id = auth.uid()`
3. DB trigger `on_group_member_delete` decrements `members_count`
4. If caller was creator → find oldest remaining member by `joined_at` → `UPDATE groups SET created_by = nextMember.user_id` (or `NULL` if no one remains)

**Why RPC**: pre-v9 the JS-layer ownership transfer silently failed because the
groups UPDATE policy's WITH CHECK (defaulted from USING) required new
`created_by = auth.uid()`, which was always false during transfer. Caller never
saw the error because `await` discarded it. The RPC bypasses RLS as postgres,
so the transfer actually completes.

---

#### `transferGroupOwnership(groupId, newOwnerId) → { error }` *(new in v9)*

```typescript
const { error } = await supabase.rpc('transfer_group_ownership', {
  p_group_id: groupId,
  p_new_owner_id: newOwnerId,
})
return { error: error?.message ?? null }
```

**RPC validates**:
- Caller is current creator (raises `'Only the current group creator can transfer ownership'`)
- New owner is a member of the group (raises `'New owner must be a member of the group'`)
- Not transferring to self (raises `'Cannot transfer ownership to yourself'`)

On success, `groups.created_by = p_new_owner_id`. Caller remains a regular member.

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
- `getPlaceRadius(types)` — Google types → radius_meters
- `getPlaceType(types)` — Google types → SUDO place_type (`'coffee_shop'` for cafe/bakery, not `'cafe'`)

**v9 removed**: `getWeekStart()`, `clampMinutesSpent()`, `MAX_MINUTES_PER_CALL`,
`TIMESTAMP_TOLERANCE`, `TITLES` table — all moved into the `discover_landmark`
RPC (migration 42) where they cannot be bypassed by a client that skips the
helper. The constants are referenced in SQL comments but no longer in JS.

### Constants
```typescript
CACHE_RADIUS_METERS = 500        // Google Places search radius
CACHE_EXPIRY_DAYS = 30           // landmark cache TTL
```

---

#### `updateMyLocation(coord) → void`

**v9: reads own `location_sharing` via `getProfile()`** (which calls
`get_my_profile()` RPC) because direct SELECT on `profiles.location_sharing`
is REVOKE'd from authenticated. **Writes the resolved mode into
`user_locations.mode`** so friends can render correctly without needing
access to the user's preference column.

```typescript
const profile = await getProfile()                 // RPC
const mode = profile?.location_sharing ?? 'fuzzy'  // 'precise' | 'fuzzy' | 'off'
if (mode === 'off') {
  await supabase.from('user_locations').delete().eq('user_id', user.id)
  return
}
const stored = mode === 'fuzzy' ? applyFuzzyOffset(coord) : coord
await supabase.from('user_locations').upsert({
  user_id: user.id, latitude: stored.latitude, longitude: stored.longitude,
  mode,                                            // ← v9: persists mode here
  updated_at: new Date().toISOString(),
})
```

**Design rule (v9)**: row exists in `user_locations` ↔ user is currently sharing.
`off` → no row. Friends never see off-mode users (RLS enforces).

---

#### `getFriendLocations() → FriendLocation[]`

**v9 changes**: drops `location_sharing` from the profiles JOIN (column
REVOKE'd from authenticated); reads `mode` directly from `user_locations`;
no `location_sharing !== 'off'` filter needed (off-mode users have no row).

1. `SELECT * FROM friendships WHERE status='accepted' AND (requester_id=uid OR addressee_id=uid)`
2. Derive `friendIds`
3. `SELECT user_locations.user_id, latitude, longitude, mode, updated_at, profiles!inner(real_name, pet_name, avatar_url, pet_avatar_url, identity_mode) WHERE user_id IN (friendIds)`
4. Map: `display_name = identity_mode==='pet' ? pet_name ?? real_name : real_name ?? pet_name`

**`FriendLocation` v9 shape** includes `mode: 'precise' | 'fuzzy'` so the
frontend renders precise (small marker) vs fuzzy (large area circle, ~500m).

---

#### `subscribeToFriendLocations(friendIds, onUpdate) → Promise<() => void>`

**v9 changes**: profileCache no longer fetches `location_sharing` (REVOKE'd);
reads `mode` from the realtime payload's `user_locations` row. Off-mode users
have no row → no realtime event for them.

1. Batch fetch `profiles (id, real_name, pet_name, avatar_url, pet_avatar_url, identity_mode)` for all `friendIds` → build `profileCache`
2. Subscribe to `postgres_changes` on `user_locations`, filter: `user_id=in.(friendIds)`
3. On event: lookup profile from cache, call `onUpdate({ ..., mode: payload.new.mode, ... })`
4. Return `() => supabase.removeChannel(channel)`

**Known tech debt (TD-8)**: `profileCache` built once at subscribe time;
identity_mode change during subscription requires re-subscribe to reflect.

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

**v9: thin wrapper over `discover_landmark` RPC.** ~110 lines of JS-layer
anti-cheat logic moved into the SECURITY DEFINER function (migration 42).

**Flow:**
1. `cacheNearbyPlaces(coord)` → get nearby landmarks (still client-side, calls Google Places)
2. Find candidate landmark where Euclidean distance (with latitude cosine correction) ≤ `radius_meters`
3. Call RPC: `supabase.rpc('discover_landmark', { p_landmark_id: landmark.id, p_lat: coord.latitude, p_lng: coord.longitude, p_minutes_spent: minutesSpent })`
4. RPC returns DiscoverResult JSON or null

**RPC server-side logic** (cannot be bypassed):
- Re-verify coord within `landmark.radius_meters` (anti-spoof, partial — true GPS spoofing still requires TD-1 device attestation)
- First visit: clamp `minutesSpent` to [0, 480], INSERT, award `EXPLORATION_XP[place_type]` via `add_xp()`
- Return visit: clamp by both 480 cap AND elapsed-time tolerance (`elapsed + 10 min`); UPDATE with optimistic lock on `last_visited_at`; unlock junior/senior titles at visit_count thresholds 7/30
- All XP/title mutations atomic in single transaction

**Title table** (hardcoded in RPC, mirror of removed JS const):
```
library:     { junior: 'Bookworm',      senior: 'Library King'     }
dining:      { junior: 'Big Eater',     senior: 'Dining Hall King' }
gym:         { junior: 'Gym Newbie',    senior: 'Gym Fanatic'      }
coffee_shop: { junior: 'Coffee Lover',  senior: 'Coffee Addict'    }
other:       { junior: 'Explorer',      senior: 'Master Explorer'  }
```

**Null returns**: not logged in, no nearby landmark from `cacheNearbyPlaces`,
coord not within any landmark's radius, RPC error (e.g. landmark not found,
optimistic lock conflict, coord rejected by server-side check).

---

#### `setActiveTitle(title: string | null) → Promise<void>`

**v9: thin wrapper over `set_active_title(p_title)` RPC.** Direct UPDATE on
explorations is REVOKE'd from authenticated, so this RPC is the only path.

```typescript
await supabase.rpc('set_active_title', { p_title: title })
```

**RPC logic** (migration 42):
1. Clear all active_title for this user (one-active-at-a-time invariant)
2. If `p_title IS NULL` → done (unequip)
3. Find an exploration whose `titles_earned` array contains `p_title`
4. Not found → silent return (anti-cheat: cannot equip unearned title)
5. Set that exploration's `active_title = p_title`

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

**v9 changes**:
- `RankingEntry` interface dropped `pet_avatar_url` field — was leaking pet
  identity even when ranking_identity_mode='real' or profile_visibility='real_only'
- `active_title` aggregation by `(user, place_type)` is **by design**: a Bookworm
  title earned at library shows only in library ranking, not in gym/cafe/dining

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

**Authoritative list: [TECH_DEBT.md](TECH_DEBT.md).** The file below is no
longer maintained — refer to TECH_DEBT.md for all TD entries (TD-1 through
TD-24), including severity, status, fix approach, and trigger timing.

Quick orientation (as of 2026-04-17 / v9):
- **Closed in v7 or earlier**: TD-2, TD-4, TD-5, TD-7
- **Closed in v9**: TD-3 (partial; group chat is design-decision), TD-10, TD-11
- **Module 10 prerequisites**: TD-1 (GPS attestation), TD-6 + TD-9 + TD-22 (Edge Function migration), TD-13 (university reset trigger), TD-15 (Storage mime/size), TD-24 (DM race)
- **Open / pre-launch evaluate**: TD-21 (`.or()` injection), TD-23 (XP race)
- **Frontend / long-term**: TD-8 (subscription cache), TD-12 (landmarkTimers), TD-14 (friend-tier profile fields), TD-17–20 (path optimization)

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

## RLS Policy Summary (v9)

In addition to row-level RLS policies, **column-level GRANT/REVOKE** is now
applied throughout. The "Column-level UPDATE" column shows which columns
authenticated may modify directly. Where the entire table is locked from
client writes, mutations go through SECURITY DEFINER RPCs.

| Table | SELECT (RLS) | INSERT (RLS) | UPDATE (RLS) | DELETE (RLS) | Column-level UPDATE | Notes |
|-------|--------|--------|--------|--------|--------|--------|
| `profiles` | Any logged-in (limited cols) | Own row | Own row | Own row | 21 cols (no edu_verified, pet_xp, sudo_id, etc) | Full read via `get_my_profile` / `get_other_profile` RPCs |
| `friendships` | Participants | Requester = uid | Addressee only | Either party | `status` only | Bidirectional unique index prevents A→B + B→A |
| `blocked_users` | blocker OR blocked | blocker = uid | — | blocker = uid | — | |
| `groups` | Members (via gm) or searchable | Authenticated | Creator only | Creator only | `name, description, avatar_url, is_searchable` | `created_by` writes via `leave_group` / `transfer_group_ownership` RPCs |
| `group_members` | Members of group | Authenticated (uid) | — | Own row OR creator (kick) | — | |
| `messages` | Group members | Group members + uid | Own row | — (no DELETE policy) | `content, edited_at` | Block filter NOT applied (group context, design decision) |
| `posts` | Visibility-based + double-block filter | Authenticated (uid) | Own row | Own row | `content, image_url, edited_at` | `is_post_viewer` RPC fixes specific_friends recursion |
| `post_viewers` | Post owner | Post owner | — | Post owner | — | |
| `likes` | Visible iff post visible + liker not blocked | Authenticated (uid) | — | Own row | — | |
| `comments` | Visible iff post visible + author not blocked | Authenticated (uid) | Own row | Own row | `content, edited_at` | Block filter applies |
| `user_locations` | Self or accepted friends | Own row | Own row | Own row | `latitude, longitude, mode, updated_at` | `mode` column added in v9 |
| `explorations` | Own rows | — (no policy) | — (no policy) | — (no policy) | — | All writes via `discover_landmark` / `set_active_title` RPCs |
| `explored_paths` | Own rows | Own (uid) | — | Own row | — | `compute_explored_path_bbox` trigger auto-fills bbox cols |
| `landmarks` | Authenticated | Authenticated | — | — | — | Shared cache; client-write to be migrated to Edge Function (TD-6) |
| `landmark_cache_zones` | Authenticated | Authenticated | Authenticated | — | full table-level | Same caveat as landmarks (TD-9) |
| `offer_verifications` | Own rows | Own (uid) | — | — | — | `(user_id, screenshot_url)` only at INSERT; rest written by verify-offer Edge Function (Module 7) |
