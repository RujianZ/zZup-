-- Create table for storing Free Travel (Drift Bottle) posts
CREATE TABLE IF NOT EXISTS public.travel_posts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    content text NOT NULL,
    image_url text,
    audio_url text,
    started_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    ends_at timestamp with time zone NOT NULL, -- set to started_at + duration (6h or 24h)
    duration_hours integer DEFAULT 6 NOT NULL, -- 6h or 24h
    remaining_seconds integer DEFAULT 0 NOT NULL, -- for early recall & re-dispatch
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

-- Create table for tracking Impressions / Seen suppression (阅后即避表)
CREATE TABLE IF NOT EXISTS public.travel_post_views (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    travel_post_id uuid REFERENCES public.travel_posts(id) ON DELETE CASCADE NOT NULL,
    viewed_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, travel_post_id)
);

-- Enable RLS on tables
ALTER TABLE public.travel_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_post_views ENABLE ROW LEVEL SECURITY;

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

-- ── RLS Policies for travel_post_views ──
CREATE POLICY "Users can insert own post views"
    ON public.travel_post_views
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select own post views"
    ON public.travel_post_views
    FOR SELECT
    USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS travel_posts_user_id_idx ON public.travel_posts(user_id);
CREATE INDEX IF NOT EXISTS travel_posts_status_idx ON public.travel_posts(status);
CREATE INDEX IF NOT EXISTS travel_comments_post_id_idx ON public.travel_comments(travel_post_id);
CREATE INDEX IF NOT EXISTS travel_post_views_user_post_idx ON public.travel_post_views(user_id, travel_post_id);

-- ── Postgres RPC for Dynamic Vector Matching (RoamScore + Seen Suppression) ──
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
    duration_hours int,
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
        tp.duration_hours,
        tp.view_count,
        tp.status,
        (1 - (tp.embedding <=> query_embedding))::float AS similarity
    FROM public.travel_posts tp
    JOIN public.profiles p ON p.id = tp.user_id
    WHERE tp.status = 'traveling'
      AND tp.user_id != p_user_id -- Skip own pet
      AND (tp.embedding IS NULL OR (1 - (tp.embedding <=> query_embedding)) > match_threshold)
      AND NOT EXISTS (
        -- Hard Seen Suppression: Skip if current user has ALREADY SEEN this post
        SELECT 1 FROM public.travel_post_views tpv
        WHERE tpv.travel_post_id = tp.id AND tpv.user_id = p_user_id
      )
    ORDER BY
      -- 1. Same university 1.5x priority
      CASE WHEN p.university = p_university AND p_university != '' THEN 0 ELSE 1 END,
      -- 2. FreshBoost for posts created < 1h ago
      CASE WHEN tp.started_at > (now() - interval '1 hour') THEN 0 ELSE 1 END,
      -- 3. Sort by semantic similarity
      tp.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_travel_posts(vector(1536), float, int, uuid, text) TO authenticated;

-- Function to record an impression / view for Seen Suppression
CREATE OR REPLACE FUNCTION public.record_travel_post_view(p_post_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.travel_post_views (user_id, travel_post_id)
    VALUES (p_user_id, p_post_id)
    ON CONFLICT (user_id, travel_post_id) DO NOTHING;

    UPDATE public.travel_posts
    SET view_count = view_count + 1
    WHERE id = p_post_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_travel_post_view(uuid, uuid) TO authenticated;

-- Function to early recall a pet back home
CREATE OR REPLACE FUNCTION public.recall_travel_pet(p_post_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_post public.travel_posts%ROWTYPE;
    v_rem_secs integer;
BEGIN
    SELECT * INTO v_post FROM public.travel_posts
    WHERE id = p_post_id AND user_id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Post not found');
    END IF;

    -- Calculate remaining seconds
    v_rem_secs := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_post.ends_at - now()))));

    UPDATE public.travel_posts
    SET status = 'returned',
        remaining_seconds = v_rem_secs
    WHERE id = p_post_id;

    RETURN jsonb_build_object('success', true, 'remaining_seconds', v_rem_secs);
END;
$$;

GRANT EXECUTE ON FUNCTION public.recall_travel_pet(uuid, uuid) TO authenticated;

-- Function to renew/re-roam an expired or recalled post
CREATE OR REPLACE FUNCTION public.renew_travel_post(p_post_id uuid, p_user_id uuid, p_duration_hours integer DEFAULT 6)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.travel_posts
    SET status = 'traveling',
        started_at = now(),
        ends_at = now() + (p_duration_hours || ' hours')::interval,
        duration_hours = p_duration_hours,
        remaining_seconds = 0
    WHERE id = p_post_id AND user_id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Post not found');
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.renew_travel_post(uuid, uuid, integer) TO authenticated;

