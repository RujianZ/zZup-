-- Create table for storing Free Travel (Drift Bottle) posts
CREATE TABLE IF NOT EXISTS public.travel_posts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    content text NOT NULL,
    image_url text,
    audio_url text,
    started_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    ends_at timestamp with time zone NOT NULL, -- set to started_at + 6 hours
    embedding vector(1536), -- Vector embedding of the post content for semantic matching
    view_count integer DEFAULT 0 NOT NULL,
    status text NOT NULL DEFAULT 'traveling' CHECK (status IN ('traveling', 'returned'))
);

-- Create table for storing Comments left on traveling pet posts
CREATE TABLE IF NOT EXISTS public.travel_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    travel_post_id uuid REFERENCES public.travel_posts(id) ON DELETE CASCADE NOT NULL,
    author_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (travel_post_id, author_id) -- Only 1 comment per user per travel post max
);

-- Enable RLS on both tables
ALTER TABLE public.travel_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_comments ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies for travel_posts ──
CREATE POLICY "Users can insert their own travel posts"
    ON public.travel_posts
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone authenticated can view active travels"
    ON public.travel_posts
    FOR SELECT
    USING (auth.uid() is not null AND status = 'traveling');

CREATE POLICY "Users can manage/view their own travel posts"
    ON public.travel_posts
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ── RLS Policies for travel_comments ──
CREATE POLICY "Users can view comments for active or own travels"
    ON public.travel_comments
    FOR SELECT
    USING (
        auth.uid() is not null AND 
        EXISTS (
            SELECT 1 FROM public.travel_posts tp 
            WHERE tp.id = travel_post_id 
              AND (tp.status = 'traveling' OR tp.user_id = auth.uid())
        )
    );

CREATE POLICY "Users can comment on active travels"
    ON public.travel_comments
    FOR INSERT
    WITH CHECK (
        auth.uid() = author_id AND 
        EXISTS (
            SELECT 1 FROM public.travel_posts tp 
            WHERE tp.id = travel_post_id 
              AND tp.status = 'traveling'
        )
    );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS travel_posts_user_id_idx ON public.travel_posts(user_id);
CREATE INDEX IF NOT EXISTS travel_posts_status_idx ON public.travel_posts(status);
CREATE INDEX IF NOT EXISTS travel_comments_post_id_idx ON public.travel_comments(travel_post_id);

-- ── Postgres RPC for Dynamic Vector Matching (Priority University -> Semantic Similarity) ──
CREATE OR REPLACE FUNCTION public.match_travel_posts(
    query_embedding vector(1536),
    match_threshold float,
    match_count int,
    p_user_id uuid,
    p_university text
)
RETURNS TABLE (
    id uuid,
    user_id uuid,
    content text,
    image_url text,
    audio_url text,
    started_at timestamp with time zone,
    ends_at timestamp with time zone,
    view_count int,
    status text,
    similarity float
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        tp.id,
        tp.user_id,
        tp.content,
        tp.image_url,
        tp.audio_url,
        tp.started_at,
        tp.ends_at,
        tp.view_count,
        tp.status,
        1 - (tp.embedding <=> query_embedding) AS similarity
    FROM public.travel_posts tp
    JOIN public.profiles p ON p.id = tp.user_id
    WHERE tp.status = 'traveling'
      AND tp.user_id != p_user_id -- Skip own pet
      AND 1 - (tp.embedding <=> query_embedding) > match_threshold
      AND NOT EXISTS (
        -- Skip if the current user has already left a comment on this post
        SELECT 1 FROM public.travel_comments tc
        WHERE tc.travel_post_id = tp.id AND tc.author_id = p_user_id
      )
    ORDER BY
      -- Prioritize same university (同校优先)
      CASE WHEN p.university = p_university THEN 0 ELSE 1 END,
      -- Sort by semantic similarity
      tp.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Grant execution permission to authenticated users
GRANT EXECUTE ON FUNCTION public.match_travel_posts(vector(1536), float, int, uuid, text) TO authenticated;

-- Function to safely increment the view count of a travel post
CREATE OR REPLACE FUNCTION public.increment_travel_post_view(post_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.travel_posts
    SET view_count = view_count + 1
    WHERE id = post_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_travel_post_view(uuid) TO authenticated;
