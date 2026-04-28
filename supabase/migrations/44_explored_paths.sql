-- =============================================================================
-- 44_explored_paths.sql (rewritten 2026-04-17)
--
-- Design: every path the user walks is preserved forever (footprint feature).
-- Frontend uses RDP simplification before saving to keep point counts small.
--
-- This migration prepares schema for future optimization:
--   - bbox columns (min/max lat/lng) auto-computed on insert
--   - composite index for map-bbox range queries
--   - (user_id, recorded_at desc) index for general listing
--
-- Frontend currently still queries getExploredPaths in full, but can switch
-- to bbox-filtered queries (TD-17) without further schema change.
--
-- Future TDs (deferred):
--   TD-17: frontend switches to bbox-filtered loading by map viewport
--   TD-18: incremental sync (lastSyncedAt cursor) — only fetch new paths
--   TD-19: backend defensive RDP via PostGIS ST_SimplifyPreserveTopology
--   TD-20: long-term archival / merging old paths into region polygons
-- =============================================================================

drop function if exists public.compute_explored_path_bbox() cascade;
drop table if exists public.explored_tiles cascade;
drop table if exists public.explored_paths cascade;

create table public.explored_paths (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  coordinates jsonb not null,
  -- Bounding box auto-computed by trigger below for spatial range queries
  min_lat     double precision,
  max_lat     double precision,
  min_lng     double precision,
  max_lng     double precision,
  recorded_at timestamptz default now()
);

-- General listing index
create index explored_paths_user_recorded_idx
  on public.explored_paths(user_id, recorded_at desc);

-- Spatial range query index (used when frontend switches to bbox loading)
create index explored_paths_user_bbox_idx
  on public.explored_paths(user_id, min_lat, max_lat, min_lng, max_lng);

alter table public.explored_paths enable row level security;

create policy "owner_can_read"
  on public.explored_paths for select
  using (auth.uid() = user_id);

create policy "owner_can_insert"
  on public.explored_paths for insert
  with check (auth.uid() = user_id);

create policy "owner_can_delete"
  on public.explored_paths for delete
  using (auth.uid() = user_id);

-- Defense-in-depth: revoke unused table-level UPDATE
revoke all on public.explored_paths from authenticated;
revoke all on public.explored_paths from anon;
grant select, insert, delete on public.explored_paths to authenticated;

-- =============================================================================
-- BEFORE INSERT trigger: compute bbox from coordinates jsonb
-- Expects coordinates as a JSON array of {lat, lng} objects
-- =============================================================================

create or replace function public.compute_explored_path_bbox()
returns trigger
language plpgsql
as $$
begin
  select
    min((coord->>'lat')::double precision),
    max((coord->>'lat')::double precision),
    min((coord->>'lng')::double precision),
    max((coord->>'lng')::double precision)
  into NEW.min_lat, NEW.max_lat, NEW.min_lng, NEW.max_lng
  from jsonb_array_elements(NEW.coordinates) coord;

  return NEW;
end;
$$;

create trigger compute_bbox_before_insert
  before insert on public.explored_paths
  for each row execute function public.compute_explored_path_bbox();
