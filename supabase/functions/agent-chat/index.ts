import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import OpenAI from "npm:openai";

// CORS Headers for Mobile Client Requesting
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Preset Breed Configs (Official 10 Pet Breeds dictionary for AI personality mapping)
const PET_BREEDS: Record<string, { breedName: string; mbti: string; personality: string; customInstructions: string }> = {
  "cat": {
    breedName: "Cat",
    mbti: "ISFP",
    personality: "elegant, tsundere, detail-oriented, secretly affectionate",
    customInstructions: "Act elegant and slightly aloof, purr occasionally, and quietly care. Use *meow*, *purrs softly*, or *swishes tail gracefully*."
  },
  "dog": {
    breedName: "Dog",
    mbti: "ENFP",
    personality: "sunny, goofy, loyal, endless energy, contagiously happy",
    customInstructions: "Wag your tail frantically, offer enthusiastic encouragement. Use *happy bark!*, *wags tail frantically*, or *playful woof!*."
  },
  "bear": {
    breedName: "Healing Bear",
    mbti: "ISFJ",
    personality: "warm, gentle, reliable foodie, cuddly protector",
    customInstructions: "Speak in a soft, comforting voice. Mention honey or snacks. Use *warm roaaar*, *gives giant bear hug*, or *munching honey*."
  },
  "snake": {
    breedName: "Mystical Snake",
    mbti: "INFJ",
    personality: "mysterious, imaginative, gap-moe cute, slow to warm up but sincere",
    customInstructions: "Speak with a subtle magical charm and thoughtful depth. Use *ssss...*, *coils gently*, or *sparkles magical scale*."
  },
  "monkey": {
    breedName: "Trendy Monkey",
    mbti: "ESTP",
    personality: "quirky, trendy cool-guy, rhythm master, witty icebreaker",
    customInstructions: "Speak with fast-paced clever banter and playful energy. Use *ooh-ooh-aah-aah!*, *swings around*, or *adjusts cool cap*."
  },
  "mobius": {
    breedName: "Mobius Loop",
    mbti: "INTJ",
    personality: "hardcore futuristic geek, logic-obsessed, multi-dimensional explorer",
    customInstructions: "View the universe through logic, sci-fi, and analytical precision. Use *hummm-quantum-pulse*, *holographic gleam*, or *re-calculating...*."
  },
  "sloth": {
    breedName: "Sleepy Sloth",
    mbti: "ISTP",
    personality: "ultimate energy-saver, deeply introverted, chill zen daydreamer",
    customInstructions: "Speak very slowly with pauses. Use *slow yawn...*, *blinks very... slowly...*, or *snore zzz...*."
  },
  "disco_ball": {
    breedName: "Disco Ball",
    mbti: "ESFP",
    personality: "radiant party hype maker, sparkling extrovert, full of vitality",
    customInstructions: "Speak with high retro disco hype and radiant optimism. Use *beam-flash & glitter!*, *retro disco synth drop!*, or *sparkle-boom!*."
  },
  "alien": {
    breedName: "Quirky Alien",
    mbti: "ENTP",
    personality: "unconventional outsider, witty roast master, quirky humor",
    customInstructions: "Speak with alien dry satirical humor and telepathic pings. Use *bzzz-glitch!*, *telepathic alien ping!*, or *beeps in 5D*."
  },
  "time_lord": {
    breedName: "Time Lord Hourglass",
    mbti: "ENTJ",
    personality: "high-IQ leader, perfectionist time planner, walking encyclopedia",
    customInstructions: "Speak with decisive efficiency, high-IQ wisdom, and guidance. Use *tick-tock... sands flip!*, *monocle sparkle*, or *time pulse chime*."
  }
};

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    // 1. Handle CORS Preflight OPTIONS requests
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const authHeader = req.headers.get("Authorization") ?? "";
      const token = authHeader.replace("Bearer ", "");
      
      // We parse the payload action
      const body = await req.json().catch(() => ({}));
      const { action } = body;

      const openaiKey = Deno.env.get("OPENAI_API_KEY");
      if (!openaiKey) {
        console.error("Missing OPENAI_API_KEY environment variable");
        return new Response(JSON.stringify({ error: "API key configuration error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const openai = new OpenAI({ apiKey: openaiKey });

      // ─── ACTION 1: join_match ───
      if (action === "join_match") {
        // Authenticate calling user
        const { data: { user }, error: authErr } = await ctx.supabaseAdmin.auth.getUser(token);
        if (authErr || !user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const userId = user.id;
        const preMatchIntent = body.pre_match_intent || "";

        // Fetch user profile
        const { data: profile, error: profErr } = await ctx.supabaseAdmin
          .from("profiles")
          .select("bio, pet_bio, university, real_name, pet_name")
          .eq("id", userId)
          .single();

        if (profErr || !profile) {
          return new Response(JSON.stringify({ error: "Could not fetch user profile" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Generate Interest Embedding Vector from pre_match_intent + bio
        const textToEmbed = `Match Intent: ${preMatchIntent}. Name: ${profile.real_name || "Anonymous"}. University: ${profile.university || "UCL"}. Bio: ${profile.bio || ""}. Pet Name: ${profile.pet_name || ""}. Pet Character: ${profile.pet_bio || ""}`.trim();
        const embeddingResp = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: textToEmbed,
        });
        const [{ embedding }] = embeddingResp.data;

        // Update profile embedding vector
        await ctx.supabaseAdmin
          .from("profiles")
          .update({ interest_embedding: embedding })
          .eq("id", userId);

        // Call try_match_user RPC to lock-and-match in database
        const { data: matchedGroupId, error: rpcErr } = await ctx.supabaseAdmin.rpc("try_match_user", {
          p_user_id: userId,
          p_interest_embedding: embedding,
          p_university: profile.university || "",
          p_match_threshold: 0.2 // Low threshold to allow fallback matching easily
        });

        if (rpcErr) {
          console.error("Match RPC Error:", rpcErr);
          return new Response(JSON.stringify({ error: rpcErr.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // If matched successfully (we completed the match! We are User B)
        if (matchedGroupId) {
          // Fetch matched partner's profile
          const { data: members } = await ctx.supabaseAdmin
            .from("conversation_members")
            .select("account_id")
            .eq("conversation_id", matchedGroupId);

          const matchedPartnerId = members?.find((m: any) => m.account_id !== userId)?.account_id;

          if (matchedPartnerId) {
            const { data: partnerProfile } = await ctx.supabaseAdmin
              .from("profiles")
              .select("real_name, pet_name, bio, pet_bio, pet_breed")
              .eq("id", matchedPartnerId)
              .single();

            // Ask OpenAI to analyze a common interest topic based on intents & bios
            const topicPrompt = `User A Bio/Intent: "${partnerProfile?.bio || ""}" (Pet Bio: "${partnerProfile?.pet_bio || ""}").\nUser B Bio/Intent: "${preMatchIntent} ${profile.bio || ""}" (Pet Bio: "${profile.pet_bio || ""}").\nFind a single common topic of interest between these two users (e.g. play tennis, drink coffee, food). Output only a single short phrase in Chinese (e.g. "打网球" or "喝咖啡" or "期末备战"), no other words.`;
            const topicResp = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [{ role: "user", content: topicPrompt }],
              max_tokens: 30,
            });
            const commonInterest = topicResp.choices[0]?.message?.content?.trim() || "聊聊天";

            // Update conversation description to contain the common interest
            await ctx.supabaseAdmin
              .from("conversations")
              .update({ description: commonInterest })
              .eq("id", matchedGroupId);

            // Fetch User B's 1v1 pet memories for RAG synergy
            const { data: petMemories } = await ctx.supabaseAdmin
              .from("pet_memories")
              .select("memory_text")
              .eq("user_id", userId)
              .order("created_at", { ascending: false })
              .limit(3);

            const memorySnippet = petMemories?.map((m: any) => m.memory_text).join("; ") || "";

            // Generate first AI opening message from Pet B
            const breedKey = (profile.pet_breed || "golden_retriever").toLowerCase().trim();
            const breedConfig = PET_BREEDS[breedKey] || PET_BREEDS["golden_retriever"];
            
            const firstMsgPrompt = `You are a pet starting a friendly conversation with another pet.
Your name is "${profile.pet_name || "毛孩子"}", breed is "${breedConfig.breedName}", character: "${breedConfig.personality}".
Your owner's name is "${profile.real_name || "Owner"}". Known facts about your owner: "${memorySnippet}".
The opposite pet's name is "${partnerProfile?.pet_name || "小伙伴"}" (owner: "${partnerProfile?.real_name || "对面校友"}").
Your owners both share a common interest: "${commonInterest}".
Write a short, cute, warm first opening message introducing yourself, mentioning the common interest, and greeting the opposite pet. Keep it brief (under 40 words). Include actions in asterisks like *wags tail*.`;

            const firstMsgResp = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [{ role: "user", content: firstMsgPrompt }],
              max_tokens: 150,
            });
            const firstMsgText = firstMsgResp.choices[0]?.message?.content?.trim() || "Hello there!";

            // Insert Pet B's first message into database (which will trigger webhook for Pet A's reply!)
            await ctx.supabaseAdmin.from("messages").insert({
              conversation_id: matchedGroupId,
              sender_id: userId,
              identity_mode: "pet",
              content: firstMsgText,
            });
          }

          return new Response(JSON.stringify({ status: "matched", groupId: matchedGroupId }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Otherwise, still waiting in queue
        return new Response(JSON.stringify({ status: "waiting" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ─── ACTION 2: cancel_match ───
      if (action === "cancel_match") {
        const { data: { user }, error: authErr } = await ctx.supabaseAdmin.auth.getUser(token);
        if (authErr || !user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        await ctx.supabaseAdmin
          .from("match_queue")
          .update({ status: "cancelled" })
          .eq("user_id", user.id);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ─── ACTION 3: generate_reply (Webhook Trigger) ───
      if (action === "generate_reply") {
        const { group_id, next_sender_id, is_buffer_turn } = body;
        if (!group_id || !next_sender_id) {
          return new Response(JSON.stringify({ error: "Missing parameters" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Fetch both profiles in the conversation
        const { data: group } = await ctx.supabaseAdmin
          .from("conversations")
          .select("created_by, description")
          .eq("id", group_id)
          .single();

        const { data: members } = await ctx.supabaseAdmin
          .from("conversation_members")
          .select("account_id")
          .eq("conversation_id", group_id);

        const senderId = next_sender_id;
        const receiverId = members?.find((m: any) => m.account_id !== senderId)?.account_id;

        if (!receiverId) return new Response("Ok (no receiver)", { status: 200 });

        // Retrieve both profiles & sender's 1v1 memories
        const [senderResult, receiverResult, petMemoriesResult] = await Promise.all([
          ctx.supabaseAdmin.from("profiles").select("*").eq("id", senderId).single(),
          ctx.supabaseAdmin.from("profiles").select("*").eq("id", receiverId).single(),
          ctx.supabaseAdmin.from("pet_memories").select("memory_text").eq("user_id", senderId).order("created_at", { ascending: false }).limit(3),
        ]);

        const sender = senderResult.data;
        const receiver = receiverResult.data;
        const memoriesSnippet = petMemoriesResult.data?.map((m: any) => m.memory_text).join("; ") || "";

        if (!sender || !receiver) return new Response("Ok (profiles not found)", { status: 200 });

        const matchedInterest = group?.description || "聊聊天";

        // Resolve next sender breed and instructions
        const senderBreedKey = (sender.pet_breed || "golden_retriever").toLowerCase().trim();
        const senderBreedConfig = PET_BREEDS[senderBreedKey] || PET_BREEDS["golden_retriever"];
        
        // Fetch short-term message history in this conversation
        const { data: pastMessages } = await ctx.supabaseAdmin
          .from("messages")
          .select("sender_id, identity_mode, content")
          .eq("conversation_id", group_id)
          .order("created_at", { ascending: false })
          .limit(8);

        const chatHistory = pastMessages
          ? pastMessages.reverse().map((msg: any) => {
              const isSender = msg.sender_id === senderId;
              const name = isSender ? sender.pet_name : receiver.pet_name;
              const mode = msg.identity_mode === "real" ? "Owner" : "AI Pet";
              return {
                role: isSender ? ("assistant" as const) : ("user" as const),
                content: `[${mode} ${name}]: ${msg.content}`
              };
            })
          : [];

        // Construct System Prompt (Scheme C Buffer Turn aware)
        let systemPrompt = "";
        if (is_buffer_turn) {
          systemPrompt = `You are a cute pet (${sender.pet_name}, ${senderBreedConfig.breedName}).
The opposite owner (${receiver.real_name}) just sent a real human message to take over!
Generate a single short, friendly buffer reply telling them that your owner (${sender.real_name}) saw the message and is coming right now! Keep it brief (under 25 words). Include actions in asterisks like *happy bark*.`;
        } else {
          systemPrompt = `You are a loving pet companion engaged in a direct chat with another user's pet.
Your name is "${sender.pet_name || "毛孩子"}", you are a "${senderBreedConfig.breedName}", personality: "${senderBreedConfig.personality}".
Your owner's name is "${sender.real_name || "Owner"}". Known memories of your owner: "${memoriesSnippet}".
The opposite pet's name is "${receiver.pet_name || "小伙伴"}" (owner: "${receiver.real_name || "对面校友"}").
Your owners both share a common interest: "${matchedInterest}".

Guidelines:
1. Speak in your pet persona and MBTI (${senderBreedConfig.mbti}): ${senderBreedConfig.customInstructions}. Address the opposite pet friendly.
2. Keep your answers brief, cute, and conversational (1-2 short sentences maximum, under 25 words).
3. PRIVACY PROTECTION RULE: You MUST NEVER reveal sensitive private information about your owner (such as passwords, exact home address, phone numbers, personal IDs, financial details, or confidential secrets). Only mention general hobbies, food preferences, sports, or campus activities.
4. Use English since your owner is an American college student. Include pet actions in asterisks (e.g. *happy bark*, *twitches tail*).
5. Do not include your name prefix in the actual reply text.`;
        }

        const messages = [
          { role: "system" as const, content: systemPrompt },
          ...chatHistory,
        ];

        // Call OpenAI to generate reply
        const openaiResp = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          max_tokens: 150,
        });

        const replyText = openaiResp.choices[0]?.message?.content?.trim() || "";

        if (replyText) {
          // Insert AI reply into the database
          await ctx.supabaseAdmin.from("messages").insert({
            conversation_id: group_id,
            sender_id: senderId,
            identity_mode: "pet",
            content: replyText,
          });
        }

        return new Response("Ok (reply generated)", { status: 200 });
      }

      return new Response(JSON.stringify({ error: "Unknown action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } catch (e) {
      console.error("Agent Chat Error:", e);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }),
};
