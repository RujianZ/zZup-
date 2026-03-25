-- 清理
drop table if exists likes cascade;
drop table if exists comments cascade;
drop table if exists posts cascade;
-- ==================== posts ====================
create table posts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete set null,
  identity_mode text not null check (identity_mode in ('real', 'pet')),
  content text not null,
  image_url text,
  visibility text not null default 'logged_in' check (visibility in ('public', 'logged_in', 'university', 'friends', 'private')),
  likes_count integer default 0,
  comments_count integer default 0,
  created_at timestamptz default now(),
  edited_at timestamptz
);
alter table posts enable row level security;
create policy "Posts viewable based on visibility"
  on posts for select using (
    visibility = 'public'
    or (
      auth.uid() is not null and (
        auth.uid() = user_id
        or visibility = 'logged_in'
        or (
          visibility = 'university'
          and (
            select university from profiles where id = auth.uid()
          ) = (
            select university from profiles where id = posts.user_id
          )
        )
        or (
          visibility = 'friends'
          and exists (
            select 1 from friendships
            where status = 'accepted'
              and (
                (requester_id = auth.uid() and addressee_id = posts.user_id)
                or (addressee_id = auth.uid() and requester_id = posts.user_id)
              )
          )
        )
      )
    )
  );
create policy "Users can insert own post"
  on posts for insert with check (auth.uid() = user_id);
create policy "Users can update own post"
  on posts for update using (auth.uid() = user_id);
create policy "Users can delete own post"
  on posts for delete using (auth.uid() = user_id);
-- ==================== comments ====================
create table comments (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references posts(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete set null,
  identity_mode text not null check (identity_mode in ('real', 'pet')),
  content text not null,
  created_at timestamptz default now(),
  edited_at timestamptz
);
alter table comments enable row level security;
create policy "Comments are viewable by logged in users"
  on comments for select using (auth.uid() is not null);
create policy "Users can insert own comment"
  on comments for insert with check (auth.uid() = user_id);
create policy "Users can update own comment"
  on comments for update using (auth.uid() = user_id);
create policy "Users can delete own comment"
  on comments for delete using (auth.uid() = user_id);
-- ==================== likes ====================
create table likes (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references posts(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(post_id, user_id)
);
alter table likes enable row level security;
create policy "Likes are viewable by logged in users"
  on likes for select using (auth.uid() is not null);
create policy "Users can insert own like"
  on likes for insert with check (auth.uid() = user_id);
create policy "Users can delete own like"
  on likes for delete using (auth.uid() = user_id);
