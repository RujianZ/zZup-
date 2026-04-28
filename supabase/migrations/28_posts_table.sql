-- =============================================================================
-- 28_posts_table.sql (rewritten 2026-04-17)
--
-- Changes from original:
--   - posts: column-level UPDATE → (content, image_url, edited_at) only
--     (locks identity_mode, visibility, likes_count, comments_count,
--      created_at, user_id from being tampered with)
--   - comments: column-level UPDATE → (content, edited_at) only
--     (locks identity_mode and post_id — no comment-moving between posts)
--   - posts SELECT policy: bidirectional block filter
--   - comments SELECT: tied to post visibility + block filter on comment author
--   - likes SELECT: tied to post visibility + block filter on liker
--   - post_viewers SELECT stays author-only; specific_friends visibility check
--     uses SECURITY DEFINER function is_post_viewer() to bypass RLS recursion
--     (fixes a previously latent bug where invited friends couldn't see
--      specific_friends posts because their EXISTS subquery was blocked
--      by post_viewers RLS)
--   - Indexes: posts(created_at desc), posts(user_id, created_at desc),
--     comments(post_id, created_at)
--
-- NOT changed:
--   - posts.user_id / comments.user_id FKs stay ON DELETE SET NULL
--     (content preservation per soft-delete philosophy)
--   - likes / post_viewers FKs stay ON DELETE CASCADE (operational)
--   - count triggers (likes_count, comments_count) — TD-2 already fixed
-- =============================================================================

-- Cleanup
drop function if exists public.is_post_viewer(uuid);
drop trigger if exists on_like_change on likes;
drop trigger if exists on_comment_change on comments;
drop function if exists public.update_likes_count();
drop function if exists public.update_comments_count();
drop table if exists public.post_viewers cascade;
drop table if exists public.likes cascade;
drop table if exists public.comments cascade;
drop table if exists public.posts cascade;

-- =============================================================================
-- posts
-- =============================================================================

create table public.posts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete set null,
  identity_mode text not null check (identity_mode in ('real', 'pet')),
  content text not null,
  image_url text,
  visibility text not null default 'logged_in'
    check (visibility in ('logged_in', 'university', 'friends', 'specific_friends', 'private')),
  likes_count integer default 0,
  comments_count integer default 0,
  created_at timestamptz default now(),
  edited_at timestamptz
);

create index posts_created_at_desc_idx on public.posts(created_at desc);
create index posts_user_id_created_at_idx on public.posts(user_id, created_at desc);

alter table public.posts enable row level security;

create policy "Users can insert own post"
  on public.posts for insert with check (auth.uid() = user_id);

create policy "Users can update own post"
  on public.posts for update using (auth.uid() = user_id);

create policy "Users can delete own post"
  on public.posts for delete using (auth.uid() = user_id);

-- =============================================================================
-- comments
-- =============================================================================

create table public.comments (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references public.posts(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete set null,
  identity_mode text not null check (identity_mode in ('real', 'pet')),
  content text not null,
  created_at timestamptz default now(),
  edited_at timestamptz
);

create index comments_post_id_created_at_idx
  on public.comments(post_id, created_at);

alter table public.comments enable row level security;

create policy "Users can insert own comment"
  on public.comments for insert with check (auth.uid() = user_id);

create policy "Users can update own comment"
  on public.comments for update using (auth.uid() = user_id);

create policy "Users can delete own comment"
  on public.comments for delete using (auth.uid() = user_id);

-- =============================================================================
-- likes
-- =============================================================================

create table public.likes (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references public.posts(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(post_id, user_id)
);

alter table public.likes enable row level security;

create policy "Users can insert own like"
  on public.likes for insert with check (auth.uid() = user_id);

create policy "Users can delete own like"
  on public.likes for delete using (auth.uid() = user_id);

-- =============================================================================
-- post_viewers (specific_friends visibility list — author-only access)
-- =============================================================================

create table public.post_viewers (
  post_id uuid references public.posts(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  primary key (post_id, user_id)
);

alter table public.post_viewers enable row level security;

create policy "owner_can_insert_viewers"
  on public.post_viewers for insert
  with check (auth.uid() = (select user_id from public.posts where id = post_id));

create policy "owner_can_delete_viewers"
  on public.post_viewers for delete
  using (auth.uid() = (select user_id from public.posts where id = post_id));

create policy "owner_can_read_viewers"
  on public.post_viewers for select
  using (auth.uid() = (select user_id from public.posts where id = post_id));

-- =============================================================================
-- is_post_viewer(): SECURITY DEFINER helper used by posts SELECT policy
-- to bypass post_viewers RLS recursion.
--
-- Without this, a non-author trying to view a specific_friends post would
-- have their EXISTS subquery on post_viewers blocked by post_viewers RLS
-- (which only allows the post author to read). The function returns
-- only a boolean, so it cannot be used to enumerate the viewer list.
-- =============================================================================

create or replace function public.is_post_viewer(p_post_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.post_viewers
    where post_id = p_post_id and user_id = auth.uid()
  );
$$;

grant execute on function public.is_post_viewer(uuid) to authenticated;

-- =============================================================================
-- posts SELECT policy
-- Visible if:
--   - You are the author, OR the post passes visibility rules
-- AND
--   - No bidirectional block between you and the author
-- =============================================================================

create policy "Posts viewable based on visibility and blocks"
  on public.posts for select using (
    auth.uid() is not null
    and not exists (
      select 1 from public.blocked_users
      where (blocker_id = auth.uid() and blocked_id = posts.user_id)
         or (blocked_id = auth.uid() and blocker_id = posts.user_id)
    )
    and (
      auth.uid() = user_id
      or visibility = 'logged_in'
      or (
        visibility = 'university'
        and (select university from public.profiles where id = auth.uid())
          = (select university from public.profiles where id = posts.user_id)
      )
      or (
        visibility = 'friends'
        and exists (
          select 1 from public.friendships
          where status = 'accepted'
            and (
              (requester_id = auth.uid() and addressee_id = posts.user_id)
              or (addressee_id = auth.uid() and requester_id = posts.user_id)
            )
        )
      )
      or (
        visibility = 'specific_friends'
        and public.is_post_viewer(posts.id)
      )
    )
  );

-- =============================================================================
-- comments SELECT policy
-- Visible iff post is visible AND comment author isn't bidirectionally blocked
-- =============================================================================

create policy "Comments viewable when post visible and author not blocked"
  on public.comments for select using (
    auth.uid() is not null
    and exists (select 1 from public.posts where id = post_id)
    and not exists (
      select 1 from public.blocked_users
      where (blocker_id = auth.uid() and blocked_id = comments.user_id)
         or (blocked_id = auth.uid() and blocker_id = comments.user_id)
    )
  );

-- =============================================================================
-- likes SELECT policy
-- Visible iff post is visible AND liker isn't bidirectionally blocked
-- =============================================================================

create policy "Likes viewable when post visible and liker not blocked"
  on public.likes for select using (
    auth.uid() is not null
    and exists (select 1 from public.posts where id = post_id)
    and not exists (
      select 1 from public.blocked_users
      where (blocker_id = auth.uid() and blocked_id = likes.user_id)
         or (blocked_id = auth.uid() and blocker_id = likes.user_id)
    )
  );

-- =============================================================================
-- Column-level privileges
-- =============================================================================

revoke all on public.posts from authenticated;
revoke all on public.posts from anon;
grant select, insert, delete on public.posts to authenticated;
grant update (content, image_url, edited_at) on public.posts to authenticated;

revoke all on public.comments from authenticated;
revoke all on public.comments from anon;
grant select, insert, delete on public.comments to authenticated;
grant update (content, edited_at) on public.comments to authenticated;

revoke all on public.likes from authenticated;
revoke all on public.likes from anon;
grant select, insert, delete on public.likes to authenticated;

revoke all on public.post_viewers from authenticated;
revoke all on public.post_viewers from anon;
grant select, insert, delete on public.post_viewers to authenticated;

-- =============================================================================
-- count triggers (unchanged — TD-2 was fixed by switching from JS to triggers)
-- =============================================================================

create or replace function public.update_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    update public.posts set likes_count = likes_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update public.posts set likes_count = greatest(0, likes_count - 1) where id = OLD.post_id;
  end if;
  return null;
end;
$$;

create trigger on_like_change
  after insert or delete on public.likes
  for each row execute function public.update_likes_count();

create or replace function public.update_comments_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    update public.posts set comments_count = comments_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update public.posts set comments_count = greatest(0, comments_count - 1) where id = OLD.post_id;
  end if;
  return null;
end;
$$;

create trigger on_comment_change
  after insert or delete on public.comments
  for each row execute function public.update_comments_count();
