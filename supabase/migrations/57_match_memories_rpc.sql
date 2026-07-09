-- Create similarity search RPC for long-term memories
CREATE OR REPLACE FUNCTION public.match_pet_memories(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  summary text,
  similarity float
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pet_memories.id,
    pet_memories.summary,
    1 - (pet_memories.embedding <=> query_embedding) AS similarity
  FROM pet_memories
  WHERE pet_memories.user_id = p_user_id
    AND 1 - (pet_memories.embedding <=> query_embedding) > match_threshold
  ORDER BY pet_memories.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execution permission to authenticated users
GRANT EXECUTE ON FUNCTION public.match_pet_memories(vector(1536), float, int, uuid) TO authenticated;
