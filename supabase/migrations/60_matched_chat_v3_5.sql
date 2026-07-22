-- Upgrade profiles and conversations tables
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS interest_embedding vector(1536);
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS is_agent_chat boolean DEFAULT false;

-- Create matching queue table
CREATE TABLE IF NOT EXISTS public.match_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
    joined_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'matched', 'cancelled')),
    matched_group_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL
);

-- Enable Row Level Security on match_queue
ALTER TABLE public.match_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies for match_queue
CREATE POLICY "Users can manage their own queue status"
    ON public.match_queue
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Create matching transactional function (try_match_user)
CREATE OR REPLACE FUNCTION public.try_match_user(
  p_user_id uuid,
  p_interest_embedding vector(1536),
  p_university text,
  p_match_threshold float
)
RETURNS uuid -- Returns the matched conversation_id if matched, or NULL if placed in queue
LANGUAGE plpgsql SECURITY DEFINER
AS $$
declare
  v_matched_user_id uuid;
  v_group_id uuid;
begin
  -- 1. Try to find a waiting candidate using row lock to prevent race conditions
  select mq.user_id into v_matched_user_id
  from public.match_queue mq
  join public.profiles p on p.id = mq.user_id
  where mq.status = 'waiting'
    and mq.user_id != p_user_id
    and p.interest_embedding is not null
    and (1 - (p.interest_embedding <=> p_interest_embedding)) > p_match_threshold
  order by
    -- Prioritize same university
    case when p.university = p_university then 0 else 1 end,
    -- Prioritize highest similarity
    p.interest_embedding <=> p_interest_embedding,
    -- Prioritize oldest waiting
    mq.joined_at asc
  limit 1
  for update skip locked; -- Concurrency control

  -- Fallback: If no candidate above similarity threshold, pair with the oldest waiting user regardless of similarity
  if v_matched_user_id is null then
    select mq.user_id into v_matched_user_id
    from public.match_queue mq
    join public.profiles p on p.id = mq.user_id
    where mq.status = 'waiting'
      and mq.user_id != p_user_id
    order by
      mq.joined_at asc
    limit 1
    for update skip locked;
  end if;

  -- 2. If a match is found:
  if v_matched_user_id is not null then
    -- Create temporary direct conversations room
    insert into public.conversations (
      kind,
      created_by,
      members_count,
      is_temporary,
      is_agent_chat,
      expires_at
    )
    values (
      'petchat',
      p_user_id, -- Creator is User A
      2,
      true, -- temporary room
      true, -- agent AI chat room
      timezone('utc'::text, now()) + interval '3 hours'
    )
    returning id into v_group_id;

    -- Add both users to conversation_members
    insert into public.conversation_members (conversation_id, account_id, role)
    values
      (v_group_id, p_user_id, 'member'),
      (v_group_id, v_matched_user_id, 'member');

    -- Update match queue entries for both users
    insert into public.match_queue (user_id, status, matched_group_id)
    values (p_user_id, 'matched', v_group_id)
    on conflict (user_id) do update
    set status = 'matched', matched_group_id = v_group_id;

    update public.match_queue
    set status = 'matched', matched_group_id = v_group_id
    where user_id = v_matched_user_id;

    return v_group_id;
  else
    -- 3. If no match found, insert/update current user status as waiting
    insert into public.match_queue (user_id, status, matched_group_id, joined_at)
    values (p_user_id, 'waiting', null, timezone('utc'::text, now()))
    on conflict (user_id) do update
    set status = 'waiting', matched_group_id = null, joined_at = timezone('utc'::text, now());

    return null;
  end if;
end;
$$;

-- Grant execution permission to authenticated users
GRANT EXECUTE ON FUNCTION public.try_match_user(uuid, vector(1536), text, float) TO authenticated;

-- Helper to fetch the Supabase Edge Function internal URL
CREATE OR REPLACE FUNCTION public.get_supabase_internal_url()
RETURNS text
LANGUAGE plpgsql
as $$
begin
  -- kong is local edge gateway for Supabase CLI Docker containers
  return 'http://kong:8000/functions/v1/agent-chat';
end;
$$;

-- Trigger function to invoke the Deno Edge Function webhook for AI turns (Scheme C Rule)
CREATE OR REPLACE FUNCTION public.trigger_agent_chat_reply()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
as $$
declare
  v_is_agent_chat boolean;
  v_user_a_id uuid;
  v_user_b_id uuid;
  v_next_sender_id uuid;
  v_prev_sender_id uuid;
  v_next_sender_taken_over boolean;
  v_prev_sender_taken_over boolean;
  v_buffer_sent_count integer;
  v_ai_count integer;
  v_internal_url text;
begin
  -- 1. Check if the conversation is an active agent chat group
  select is_agent_chat into v_is_agent_chat
  from public.conversations
  where id = new.conversation_id;

  if v_is_agent_chat is not true then
    return new;
  end if;

  -- 2. Retrieve conversation members (exactly 2 for direct matching chats)
  select created_by into v_user_a_id
  from public.conversations
  where id = new.conversation_id;

  select account_id into v_user_b_id
  from public.conversation_members
  where conversation_id = new.conversation_id and account_id != v_user_a_id
  limit 1;

  if v_user_b_id is null then
    return new;
  end if;

  -- 3. Determine sender roles
  v_prev_sender_id := new.sender_id;
  if new.sender_id = v_user_a_id then
    v_next_sender_id := v_user_b_id;
  else
    v_next_sender_id := v_user_a_id;
  end if;

  -- 4. Check Scheme C Takeover Rules
  select exists(
    select 1 from public.messages
    where conversation_id = new.conversation_id and sender_id = v_next_sender_id and identity_mode = 'real'
  ) into v_next_sender_taken_over;

  -- If next sender has already taken over personally, AI must NOT generate any message
  if v_next_sender_taken_over is true then
    return new;
  end if;

  select exists(
    select 1 from public.messages
    where conversation_id = new.conversation_id and sender_id = v_prev_sender_id and identity_mode = 'real'
  ) into v_prev_sender_taken_over;

  -- Scheme C: If previous sender just took over with a real message, allow NEXT sender's AI to send EXACTLY 1 buffer message
  if v_prev_sender_taken_over is true then
    select count(*) into v_buffer_sent_count
    from public.messages
    where conversation_id = new.conversation_id 
      and sender_id = v_next_sender_id 
      and identity_mode = 'pet'
      and created_at > (
        select max(created_at) from public.messages 
        where conversation_id = new.conversation_id and sender_id = v_prev_sender_id and identity_mode = 'real'
      );

    -- If buffer message has already been sent after takeover, STOP AI completely
    if v_buffer_sent_count >= 1 then
      return new;
    end if;
  end if;

  -- 5. Check total AI message limit (15 max per pet)
  select count(*) into v_ai_count
  from public.messages
  where conversation_id = new.conversation_id and sender_id = v_next_sender_id and identity_mode = 'pet';

  if v_ai_count >= 15 then
    return new;
  end if;

  -- 6. Trigger Edge Function asynchronously using pg_net extension
  v_internal_url := public.get_supabase_internal_url();
  perform net.http_post(
    url := v_internal_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'action', 'generate_reply',
      'group_id', new.conversation_id,
      'next_sender_id', v_next_sender_id,
      'is_buffer_turn', v_prev_sender_taken_over
    )
  );

  return new;
exception when others then
  -- Prevent database transaction block in case webhook fails
  return new;
end;
$$;


-- Create message trigger
CREATE OR REPLACE TRIGGER trigger_agent_chat_reply_trigger
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_agent_chat_reply();

-- Trigger to upgrade temporary conversation to permanent DM once friendship is accepted
CREATE OR REPLACE FUNCTION public.handle_friendship_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
as $$
declare
  v_group_id uuid;
begin
  if new.status = 'accepted' and old.status != 'accepted' then
    -- Find the direct conversation between requester and addressee
    select cm1.conversation_id into v_group_id
    from public.conversation_members cm1
    join public.conversation_members cm2 on cm2.conversation_id = cm1.conversation_id
    join public.conversations c on c.id = cm1.conversation_id
    where c.kind = 'petchat'
      and c.is_temporary = true
      and cm1.account_id = new.requester_id
      and cm2.account_id = new.addressee_id
    limit 1;

    if v_group_id is not null then
      -- Upgrade the group chat to permanent DM
      update public.conversations
      set is_temporary = false,
          kind = 'dm',
          expires_at = null
      where id = v_group_id;
    end if;
  end if;
  return new;
end;
$$;

CREATE OR REPLACE TRIGGER on_friendship_accepted_trigger
  AFTER UPDATE ON public.friendships
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_friendship_update();
