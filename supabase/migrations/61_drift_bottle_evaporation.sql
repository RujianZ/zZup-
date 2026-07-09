-- Function: reply_to_travel_comment
-- Creates a 24h temporary direct message conversation and inserts the first message from the post owner.
CREATE OR REPLACE FUNCTION public.reply_to_travel_comment(
  p_comment_id uuid,
  p_reply_content text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
declare
  v_comment_author_id uuid;
  v_post_owner_id uuid;
  v_travel_post_id uuid;
  v_group_id uuid;
begin
  -- 1. Fetch details of the comment and the associated travel post
  select tc.author_id, tp.user_id, tc.travel_post_id
  into v_comment_author_id, v_post_owner_id, v_travel_post_id
  from public.travel_comments tc
  join public.travel_posts tp on tp.id = tc.travel_post_id
  where tc.id = p_comment_id;

  if v_comment_author_id is null or v_post_owner_id is null then
    raise exception 'Comment not found';
  end if;

  -- 2. Validate permission: only the travel post owner can reply to comments
  if auth.uid() != v_post_owner_id then
    raise exception 'Permission denied: Only the travel post owner can reply to this comment';
  end if;

  -- 3. Check if a direct message room between Owner A and Commenter B already exists
  select cm1.conversation_id into v_group_id
  from public.conversation_members cm1
  join public.conversation_members cm2 on cm2.conversation_id = cm1.conversation_id
  join public.conversations c on c.id = cm1.conversation_id
  where c.kind = 'driftbottle'
    and cm1.account_id = v_post_owner_id
    and cm2.account_id = v_comment_author_id
  limit 1;

  -- 4. Create or update the conversation
  if v_group_id is not null then
    -- Reactivate/update conversation to 24h temporary if it was already temporary
    update public.conversations
    set is_temporary = true,
        is_agent_chat = false,
        expires_at = timezone('utc'::text, now()) + interval '24 hours'
    where id = v_group_id;
  else
    -- Create a new temporary direct chat
    insert into public.conversations (
      kind,
      description,
      created_by,
      members_count,
      is_temporary,
      is_agent_chat,
      expires_at
    )
    values (
      'driftbottle',
      '旅行留言回复',
      v_post_owner_id,
      2,
      true,
      false, -- human-to-human
      timezone('utc'::text, now()) + interval '24 hours'
    )
    returning id into v_group_id;

    -- Add members to the conversation
    insert into public.conversation_members (conversation_id, account_id, role)
    values
      (v_group_id, v_post_owner_id, 'member'),
      (v_group_id, v_comment_author_id, 'member');
  end if;

  -- 5. Insert the initial reply message from the owner
  insert into public.messages (conversation_id, sender_id, identity_mode, content)
  values (v_group_id, v_post_owner_id, 'real', p_reply_content);

  return v_group_id;
end;
$$;

-- Grant execution permission to authenticated users
GRANT EXECUTE ON FUNCTION public.reply_to_travel_comment(uuid, text) TO authenticated;

-- Function: handle_temporary_chat_reply
-- Automatically upgrades temporary direct message conversations to permanent and creates friendships
-- when the recipient of the drift bottle reply sends their first message back to the conversation owner.
CREATE OR REPLACE FUNCTION public.handle_temporary_chat_reply()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
as $$
declare
  v_is_temporary boolean;
  v_is_agent_chat boolean;
  v_group_creator uuid;
  v_member_a uuid;
  v_member_b uuid;
begin
  -- Get conversation details
  select is_temporary, is_agent_chat, created_by into v_is_temporary, v_is_agent_chat, v_group_creator
  from public.conversations
  where id = new.conversation_id;

  -- If it's a temporary human-to-human direct chat, and the message is NOT from the creator
  if v_is_temporary is true and v_is_agent_chat is false and new.sender_id != v_group_creator then
    -- Upgrade conversation to permanent!
    update public.conversations
    set is_temporary = false,
        kind = 'dm', -- upgrade driftbottle to permanent DM
        expires_at = null
    where id = new.conversation_id;

    -- Get both members of the conversation
    select account_id into v_member_a
    from public.conversation_members
    where conversation_id = new.conversation_id
    order by joined_at asc
    limit 1;

    select account_id into v_member_b
    from public.conversation_members
    where conversation_id = new.conversation_id
    order by joined_at desc
    limit 1;

    -- Ensure they become friends (insert or update friendship to accepted)
    if exists (select 1 from public.friendships where (requester_id = v_member_a and addressee_id = v_member_b)) then
      update public.friendships
      set status = 'accepted'
      where requester_id = v_member_a and addressee_id = v_member_b;
    elsif exists (select 1 from public.friendships where (requester_id = v_member_b and addressee_id = v_member_a)) then
      update public.friendships
      set status = 'accepted'
      where requester_id = v_member_b and addressee_id = v_member_a;
    else
      insert into public.friendships (requester_id, addressee_id, status)
      values (v_member_a, v_member_b, 'accepted');
    end if;
  end if;

  return new;
end;
$$;

-- Create the trigger
CREATE OR REPLACE TRIGGER on_temporary_chat_reply_trigger
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_temporary_chat_reply();
