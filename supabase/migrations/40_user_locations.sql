drop table if exists public.user_locations;
create table public.user_locations (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  latitude  double precision not null,
  longitude double precision not null,
  updated_at timestamptz default now()
);
alter table public.user_locations enable row level security;
-- TD-10: Also enforce location_sharing != 'off' at RLS level
create policy "friends_can_read"
  on public.user_locations for select
  using (
    auth.uid() = user_id
    or (
      exists (
        select 1 from public.profiles
        where id = user_id
          and location_sharing in ('precise', 'fuzzy')
      )
      and auth.uid() in (
        select requester_id from public.friendships
        where addressee_id = user_id and status = 'accepted'
        union
        select addressee_id from public.friendships
        where requester_id = user_id and status = 'accepted'
      )
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
-- Realtime (must be after table creation)
do $$ begin
  alter publication supabase_realtime drop table user_locations;
exception when others then null;
end $$;
alter publication supabase_realtime add table user_locations;
