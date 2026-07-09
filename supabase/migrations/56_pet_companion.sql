-- Enable pgvector extension for long-term memory semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create table for storing Owner <-> Pet private chat messages
CREATE TABLE IF NOT EXISTS public.pet_chat_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    sender text NOT NULL CHECK (sender IN ('owner', 'pet')),
    content text NOT NULL,
    audio_url text, -- Store URL for voice messages if sent/replied as voice
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create table for storing Pet's summarized long-term memories
CREATE TABLE IF NOT EXISTS public.pet_memories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    summary text NOT NULL,
    embedding vector(1536), -- Standard size for OpenAI text-embedding-3-small
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on both tables for security
ALTER TABLE public.pet_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pet_memories ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies so users can only access their own private pet chat & memories
CREATE POLICY "Users can manage their own pet chat messages" 
    ON public.pet_chat_messages 
    FOR ALL 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own pet memories" 
    ON public.pet_memories 
    FOR ALL 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS pet_chat_messages_user_id_idx ON public.pet_chat_messages(user_id);
CREATE INDEX IF NOT EXISTS pet_memories_user_id_idx ON public.pet_memories(user_id);
