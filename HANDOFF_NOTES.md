# Backend Hand-off Notes (V3 AI & Travel Integration)

Hey Joe, 

We have successfully integrated the **AI Companion (zZuPer Talk)**, **Free Travel (Drift Bottle)**, and **Telepathy Pulse Matching (Agent-to-Agent chat)** modules into the new conversations v3 schema. All code compiles with **0 TS errors** and has been verified working locally.

Please review the following additions and modifications we pushed to the branch `integrate/ai-travel-v3`:

---

## 1. Database Schema & Migration Changes

We added migrations `56` through `61` to set up the schemas for vectors, travel posts, comments, match queue, and triggers for AI automatic replies.

### 🆕 New Migration Files Added:
- **`56_pet_companion.sql`**: Enables the `pgvector` extension and creates `public.pet_memories` for AI long-term memory.
- **`57_match_memories_rpc.sql`**: Creates `match_pet_memories` RPC function for RAG semantic search.
- **`58_add_pet_breed.sql`**: Adds `pet_breed` text column to the `public.profiles` table.
- **`59_free_travel_v3_5.sql`**: Creates `travel_posts` and `travel_comments` tables with RLS and the `match_travel_posts` semantic matching RPC.
- **`60_matched_chat_v3_5.sql`**: Sets up `match_queue` table, matching transactional function `try_match_user`, and the database triggers for AI-to-AI automatic turn-taking chat replies.
- **`61_drift_bottle_evaporation.sql`**: Implements drift bottle comment replies (`reply_to_travel_comment`), temporary conversation evaporation, and automatic friendship upgrade triggers.

### 🛠️ Modified Migration File:
- **`27_conversations.sql`**: 
  - **Critical Bug Fix**: The original `view members of my conversations` select RLS policy on the `conversation_members` table caused an **infinite recursion (deadlock)** when inserting messages (due to querying itself recursively).
  - **Resolution**: Updated the policy to a simple non-recursive check: `auth.uid() = account_id`. Standard client operations only query their own memberships; retrieval of other members' identities uses security definer RPCs, which bypasses RLS safely.

---

## 2. Supabase Edge Functions (Deno)

The following local functions in `supabase/functions/` are ready to be deployed:
1. **`pet-chat`**: Processes 1v1 streaming OpenAI response with RAG semantic memory retrieval.
2. **`travel-mode`**: Computes text embeddings for pet travel posts on creation.
3. **`agent-chat`**: Orchestrates agent-to-agent automatic chat loops in match rooms.

> [!IMPORTANT]
> **Production Settings Action Items:**
> 1. Ensure `pgvector` is enabled on the remote Supabase database before running these migrations.
> 2. Run `supabase functions deploy pet-chat travel-mode agent-chat` to deploy the three functions.
> 3. Set the remote environment variable `OPENAI_API_KEY` (using your OpenAI project keys) in the Supabase Dashboard.

---

## 3. Frontend App Additions
- **Navigation**: The `TravelMode` Tab and matching screens are now registered and active in `RootNavigator.tsx`.
- **Typing Fixes**: Resolved Date parsing bugs on Android Hermes engine (via `Intl.DateTimeFormat` in `lib/api/_xp.ts` to avoid `RangeError: Invalid time value` crashes).
- **Compilation status**: Clean `npx tsc --noEmit` build with **0 errors**.
