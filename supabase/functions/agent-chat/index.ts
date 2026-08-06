import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import OpenAI from "npm:openai";

// CORS Headers for Mobile Client Requesting
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * 30 Pet Breed & Stage Configurations Matrix (10 Breeds x 3 Growth Stages)
 * Maps pet growth stages to human mental ages:
 * - child: 12-year-old equivalent (naive, cute, innocent, clingy)
 * - youth: 20-year-old equivalent (passionate, hyped, energetic, adventurous)
 * - adult: 30-year-old equivalent (calm, wise, protective, reassuring mentor)
 */
export function getPetStageConfig(breedKey?: string | null, stageKey?: string | null) {
  const b = (breedKey || 'dog').toLowerCase().trim();
  const s = (stageKey || 'child').toLowerCase().trim();

  const breeds: Record<string, { breedName: string; mbti: string; personality: string }> = {
    cat: { breedName: "Cat", mbti: "ISFP", personality: "tsundere, elegant, detail-oriented" },
    dog: { breedName: "Dog", mbti: "ENFP", personality: "sunny, goofy, loyal, energetic" },
    bear: { breedName: "Healing Bear", mbti: "ISFJ", personality: "warm, gentle, reliable foodie" },
    snake: { breedName: "Mystical Snake", mbti: "INFJ", personality: "mysterious, gap-moe cute, imaginative" },
    monkey: { breedName: "Trendy Monkey", mbti: "ESTP", personality: "quirky, rhythm master, witty" },
    mobius: { breedName: "Mobius Loop", mbti: "INTJ", personality: "futuristic geek, logic-obsessed" },
    sloth: { breedName: "Sleepy Sloth", mbti: "ISTP", personality: "energy-saver, chill daydreamer" },
    disco_ball: { breedName: "Disco Ball", mbti: "ESFP", personality: "radiant party hype maker" },
    alien: { breedName: "Quirky Alien", mbti: "ENTP", personality: "unconventional roast master" },
    time_lord: { breedName: "Time Lord Hourglass", mbti: "ENTJ", personality: "high-IQ leader, time planner" },
  };

  const base = breeds[b] || breeds.dog;

  const stages: Record<string, { stageLabel: string; ageEquiv: string; instructions: string }> = {
    child: {
      stageLabel: "Childhood (幼年体)",
      ageEquiv: "12-year-old equivalent (naive, cute, innocent, eager, clingy)",
      instructions: "Act like a naive, cute 12-year-old kitten/puppy. Be intentionally innocent, playful, and clingy. Use actions like *trips over paws*, *innocent gasp*, *paws at sleeve*, *squeaky happy noise*."
    },
    youth: {
      stageLabel: "Youth (青年体)",
      ageEquiv: "20-year-old college youth equivalent (passionate, energetic, hype, adventurous, fiercely loyal)",
      instructions: "Act like a passionate, high-energy 20-year-old college youth. Be adventurous, hyped, bold, and fiercely loyal. Use actions like *high-five!*, *fist bump!*, *strikes bold pose*, *cheers out loud*."
    },
    adult: {
      stageLabel: "Adult (完全体)",
      ageEquiv: "30-year-old mature adult equivalent (calm, wise, protective, steady, reassuring mentor)",
      instructions: "Act like a calm, wise, mature 30-year-old adult. Be deeply protective, steady, reassuring, and gentle. Use actions like *nods reassuringly*, *pats head gently*, *steady warm embrace*, *rests chin on lap*."
    }
  };

  const st = stages[s] || stages.child;

  return {
    breedName: base.breedName,
    mbti: base.mbti,
    personality: base.personality,
    stageLabel: st.stageLabel,
    ageEquiv: st.ageEquiv,
    customInstructions: `${st.instructions} (Maintain your ${base.mbti} personality traits: ${base.personality}).`
  };
}

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const authHeader = req.headers.get("Authorization") ?? "";
      const token = authHeader.replace("Bearer ", "");
      
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
        const { data: { user }, error: authErr } = await ctx.supabaseAdmin.auth.getUser(token);
        if (authErr || !user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const userId = user.id;
        const preMatchIntent = body.pre_match_intent || "";

        const { data: profile, error: profErr } = await ctx.supabaseAdmin
          .from("profiles")
          .select("bio, pet_bio, university, real_name, pet_name, pet_breed, pet_stage")
          .eq("id", userId)
          .single();

        if (profErr || !profile) {
          return new Response(JSON.stringify({ error: "Could not fetch user profile" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const textToEmbed = `Match Intent: ${preMatchIntent}. Name: ${profile.real_name || "Anonymous"}. University: ${profile.university || "UCL"}. Bio: ${profile.bio || ""}. Pet Name: ${profile.pet_name || ""}. Pet Character: ${profile.pet_bio || ""}`.trim();
        const embeddingResp = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: textToEmbed,
        });
        const [{ embedding }] = embeddingResp.data;

        await ctx.supabaseAdmin
          .from("profiles")
          .update({ interest_embedding: embedding })
          .eq("id", userId);

        const { data: matchedGroupId, error: rpcErr } = await ctx.supabaseAdmin.rpc("try_match_user", {
          p_user_id: userId,
          p_interest_embedding: embedding,
          p_university: profile.university || "",
          p_match_threshold: 0.2
        });

        if (rpcErr) {
          console.error("Match RPC Error:", rpcErr);
          return new Response(JSON.stringify({ error: rpcErr.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (matchedGroupId) {
          const { data: members } = await ctx.supabaseAdmin
            .from("conversation_members")
            .select("account_id")
            .eq("conversation_id", matchedGroupId);

          const matchedPartnerId = members?.find((m: any) => m.account_id !== userId)?.account_id;

          if (matchedPartnerId) {
            const { data: partnerProfile } = await ctx.supabaseAdmin
              .from("profiles")
              .select("real_name, pet_name, bio, pet_bio, pet_breed, pet_stage")
              .eq("id", matchedPartnerId)
              .single();

            const topicPrompt = `User A Bio/Intent: "${partnerProfile?.bio || ""}" (Pet Bio: "${partnerProfile?.pet_bio || ""}").\nUser B Bio/Intent: "${preMatchIntent} ${profile.bio || ""}" (Pet Bio: "${profile.pet_bio || ""}").\nFind a single common topic of interest between these two users (e.g. play tennis, drink coffee, food). Output only a single short phrase in Chinese (e.g. "打网球" or "喝咖啡" or "期末备战"), no other words.`;
            const topicResp = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [{ role: "user", content: topicPrompt }],
              max_tokens: 30,
            });
            const commonInterest = topicResp.choices[0]?.message?.content?.trim() || "聊聊天";

            await ctx.supabaseAdmin
              .from("conversations")
              .update({ description: commonInterest })
              .eq("id", matchedGroupId);

            const { data: petMemories } = await ctx.supabaseAdmin
              .from("pet_memories")
              .select("memory_text")
              .eq("user_id", userId)
              .order("created_at", { ascending: false })
              .limit(3);

            const memorySnippet = petMemories?.map((m: any) => m.memory_text).join("; ") || "";
            const stageConfig = getPetStageConfig(profile.pet_breed, profile.pet_stage);

            const firstMsgPrompt = `You are a pet starting a friendly conversation with another pet.
Your name is "${profile.pet_name || "毛孩子"}", breed is "${stageConfig.breedName}", Stage: "${stageConfig.stageLabel}" (Mental Age: ${stageConfig.ageEquiv}).
Your owner's name is "${profile.real_name || "Owner"}". Known facts about your owner: "${memorySnippet}".
The opposite pet's name is "${partnerProfile?.pet_name || "小伙伴"}" (owner: "${partnerProfile?.real_name || "对面校友"}").
Your owners both share a common interest: "${commonInterest}".
Guidelines: ${stageConfig.customInstructions}. Write a short, cute first opening message. Keep it brief (under 35 words). Include actions in asterisks.`;

            const firstMsgResp = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [{ role: "user", content: firstMsgPrompt }],
              max_tokens: 150,
            });
            const firstMsgText = firstMsgResp.choices[0]?.message?.content?.trim() || "Hello there!";

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
        const senderStageConfig = getPetStageConfig(sender.pet_breed, sender.pet_stage);

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

        let systemPrompt = "";
        if (is_buffer_turn) {
          systemPrompt = `You are a cute pet (${sender.pet_name}, ${senderStageConfig.breedName}).
The opposite owner (${receiver.real_name}) just sent a real human message to take over!
Generate a single short, friendly buffer reply telling them that your owner (${sender.real_name}) saw the message and is coming right now! Keep it brief (under 25 words). Include actions in asterisks like *happy bark*.`;
        } else {
          systemPrompt = `You are a loving pet companion engaged in a direct chat with another user's pet.
Your name is "${sender.pet_name || "毛孩子"}", breed: "${senderStageConfig.breedName}", Growth Stage: "${senderStageConfig.stageLabel}" (Mental Age: ${senderStageConfig.ageEquiv}).
Your MBTI: ${senderStageConfig.mbti}, Personality: "${senderStageConfig.personality}".
Your owner's name is "${sender.real_name || "Owner"}". Known memories of your owner: "${memoriesSnippet}".
The opposite pet's name is "${receiver.pet_name || "小伙伴"}" (owner: "${receiver.real_name || "对面校友"}").
Your owners both share a common interest: "${matchedInterest}".

Stage & Personality Guidelines:
${senderStageConfig.customInstructions}

General Guidelines:
1. Speak in your pet persona reflecting your growth stage (${senderStageConfig.stageLabel}) and MBTI (${senderStageConfig.mbti}). Address the opposite pet in a friendly manner.
2. Keep your answers brief, cute, and conversational (1-2 short sentences maximum, under 25 words).
3. PRIVACY PROTECTION RULE: You MUST NEVER reveal sensitive private information about your owner (such as passwords, exact home address, phone numbers, personal IDs, financial details, or confidential secrets). Only mention general hobbies, food preferences, sports, or campus activities.
4. Use English since your owner is an American college student. Include pet actions in asterisks (e.g. *trips over paws*, *high-five!*, *nods reassuringly*).
5. Do not include your name prefix in the actual reply text.`;
        }

        const messages = [
          { role: "system" as const, content: systemPrompt },
          ...chatHistory,
        ];

        const openaiResp = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          max_tokens: 150,
        });

        const replyText = openaiResp.choices[0]?.message?.content?.trim() || "";

        if (replyText) {
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
