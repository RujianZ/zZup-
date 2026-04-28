-- =============================================================================
-- 26_friendships_table.sql (rewritten 2026-04-17)
--
-- Changes from original:
--   - friendships: column-level UPDATE limited to `status` only
--     (prevents addressee from swapping requester_id to fake friendships)
--   - friendships: functional unique index preventing bidirectional dupes
--     (A→B and B→A can't coexist; database-level guard against the JS-layer
--      check-then-insert race in sendFriendRequest)
--   - blocked_users: index on blocked_id for reverse lookups
--
-- NOT changed (per product decision 2026-04-17 — see 修复清单 设计决策):
--   - friendships FKs stay ON DELETE SET NULL (preserve audit trail;
--     account "cancellation" is soft-delete by design)
--   - blocked_users FKs stay ON DELETE CASCADE (no audit value once user gone)
--   - blocked_users SELECT policy stays "blocker OR blocked can view"
-- =============================================================================

drop table if exists public.blocked_users cascade;
drop table if exists public.friendships cascade;

-- =============================================================================
-- friendships
-- =============================================================================

create table public.friendships (
  id           uuid default gen_random_uuid() primary key,
  requester_id uuid references public.profiles(id) on delete set null,
  addressee_id uuid references public.profiles(id) on delete set null,
  status       text default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz default now(),
  unique(requester_id, addressee_id)
);

-- Prevent bidirectional duplicates (A→B and B→A can't coexist).
-- least/greatest normalizes pair ordering so the unique constraint
-- catches both directions.
create unique index friendships_bidirectional_unique
  on public.friendships (
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id)
  );

alter table public.friendships enable row level security;

create policy "users_can_view_own_friendships"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "requester_can_create_friendship"
  on public.friendships for insert
  with check (auth.uid() = requester_id);

-- Addressee can update (to accept). Column-level GRANT below limits
-- what they may change to `status` only (prevents swapping requester_id).
create policy "addressee_can_update_friendship"
  on public.friendships for update
  using (auth.uid() = addressee_id);

create policy "both_can_delete_friendship"
  on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Column-level privileges
revoke all on public.friendships from authenticated;
revoke all on public.friendships from anon;

grant select, insert, delete on public.friendships to authenticated;
grant update (status) on public.friendships to authenticated;

-- =============================================================================
-- blocked_users
-- =============================================================================

create table public.blocked_users (
  blocker_id uuid references public.profiles(id) on delete cascade not null,
  blocked_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (blocker_id, blocked_id)
);

-- Reverse lookup index — used by getBlockedIds (posts.ts) which queries
-- "who blocked me" by `blocked_id = me`.
create index blocked_users_blocked_id_idx on public.blocked_users(blocked_id);

alter table public.blocked_users enable row level security;

-- Both blocker and blocked can read the row (per product decision —
-- transparency over abuse-prevention strictness).
create policy "blocker_can_view_own_blocks"
  on public.blocked_users for select
  using (auth.uid() = blocker_id or auth.uid() = blocked_id);

create policy "blocker_can_insert"
  on public.blocked_users for insert
  with check (auth.uid() = blocker_id);

create policy "blocker_can_delete"
  on public.blocked_users for delete
  using (auth.uid() = blocker_id);

-- Defense-in-depth: revoke unused table-level UPDATE
-- (no UPDATE policy exists; RLS would deny all UPDATEs anyway,
-- but explicit revoke prevents accidental exposure if a future
-- migration adds an UPDATE policy)
revoke all on public.blocked_users from authenticated;
revoke all on public.blocked_users from anon;
grant select, insert, delete on public.blocked_users to authenticated;
