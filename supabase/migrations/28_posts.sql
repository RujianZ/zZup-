-- =============================================
-- 28_posts.sql
-- 帖子、评论、点赞表
-- =============================================

-- posts 表
create table public.posts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete set null,
  identity_mode text default 'real' check (identity_mode in ('real', 'pet')),
  content text,
  image_url text,
  visibility text default 'logged_in' check (
    visibility in ('public', 'logged_in', 'university', 'friends', 'private')
  ),
  likes_count integer default 0,
  comments_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table public.posts enable row level security;

create policy "可见性控制查看帖子"
  on public.posts for select
  using (
    visibility = 'public'
    or (visibility = 'logged_in' and auth.uid() is not null)
    or (visibility = 'private' and auth.uid() = user_id)
    or (visibility = 'university' and auth.uid() in (
      select id from public.profiles
      where university = (select university from public.profiles where id = posts.user_id)
    ))
    or (visibility = 'friends' and auth.uid() in (
      select requester_id from public.friendships
      where addressee_id = posts.user_id and status = 'accepted'
      union
      select addressee_id from public.friendships
      where requester_id = posts.user_id and status = 'accepted'
    ))
  );

create policy "登录用户可发帖"
  on public.posts for insert
  with check (auth.uid() = user_id);

create policy "本人可编辑帖子"
  on public.posts for update
  using (auth.uid() = user_id);

create policy "本人可删除帖子"
  on public.posts for delete
  using (auth.uid() = user_id);

-- =============================================
-- comments 表
-- =============================================

create table public.comments (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references public.posts(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete set null,
  identity_mode text default 'real' check (identity_mode in ('real', 'pet')),
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table public.comments enable row level security;

create policy "所有人可查看评论"
  on public.comments for select
  using (true);

create policy "登录用户可评论"
  on public.comments for insert
  with check (auth.uid() = user_id);

create policy "本人可编辑评论"
  on public.comments for update
  using (auth.uid() = user_id);

-- =============================================
-- likes 表
-- =============================================

create table public.likes (
  post_id uuid references public.posts(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

-- RLS
alter table public.likes enable row level security;

create policy "所有人可查看点赞"
  on public.likes for select
  using (true);

create policy "登录用户可点赞"
  on public.likes for insert
  with check (auth.uid() = user_id);

create policy "本人可取消点赞"
  on public.likes for delete
  using (auth.uid() = user_id);
