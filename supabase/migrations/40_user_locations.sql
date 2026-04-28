-- =============================================================================
-- 40_user_locations.sql (rewritten 2026-04-17)
--
-- Design:
--   profiles.location_sharing = user's PREFERENCE
--                               values: 'precise' | 'fuzzy' | 'off'
--                               REVOKE'd from authenticated SELECT in 25
--                               (private — strangers can't enumerate)
--   user_locations.mode       = SNAPSHOT of mode at last update
--                               values: 'precise' | 'fuzzy'  (off = no row)
--
--   Rule: row exists in user_locations <=> user is currently sharing.
--   Friends read user_locations directly — no need to query profiles.
--
-- Changes from original:
--   - NEW column user_locations.mode ('precise' | 'fuzzy')
--   - RLS no longer queries profiles.location_sharing (simpler & faster,
--     and avoids any column-GRANT recursion concerns)
--   - Column-level UPDATE limited to (latitude, longitude, mode, updated_at)
--
-- TD-10 satisfied: off-mode users have no row, RLS only allows
-- self + accepted friends to read, so unauthorized parties can't see location.
-- =============================================================================

drop table if exists public.user_locations cascade;

create table public.user_locations (
  user_id    uuid references public.profiles(id) on delete cascade primary key,
  latitude   double precision not null,
  longitude  double precision not null,
  mode       text not null check (mode in ('precise', 'fuzzy')),
  updated_at timestamptz default now()
);

alter table public.user_locations enable row level security;

-- Read your own location, OR a friend's location (any accepted friend).
-- No need to check sharing mode — row existence implies sharing is on.
create policy "friends_can_read"
  on public.user_locations for select
  using (
    auth.uid() = user_id
    or auth.uid() in (
      select requester_id from public.friendships
      where addressee_id = user_id and status = 'accepted'
      union
      select addressee_id from public.friendships
      where requester_id = user_id and status = 'accepted'
    )
  );

create policy "owner_can_write"
  on public.user_locations for insert
  with check (auth.uid() = user_id);

create policy "owner_can_update"
  on public.user_locations for update
  using (auth.uid() = user_id);

create policy "owner_can_delete"
  on public.user_locations for delete
  using (auth.uid() = user_id);

-- Column-level privileges
revoke all on public.user_locations from authenticated;
revoke all on public.user_locations from anon;
grant select, insert, delete on public.user_locations to authenticated;
grant update (latitude, longitude, mode, updated_at)
  on public.user_locations to authenticated;

-- Realtime
do $$ begin
  alter publication supabase_realtime drop table user_locations;
exception when others then null;
end $$;
alter publication supabase_realtime add table user_locations;
