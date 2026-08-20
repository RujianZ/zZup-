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
 * Maps pet growth stages to human mental ages and vocalization styles (sound words instead of physical action descriptions).
 */
export function getPetStageConfig(breedKey?: string | null, stageKey?: string | null) {
  const b = (breedKey || 'dog').toLowerCase().trim();
  const s = (stageKey || 'child').toLowerCase().trim();

  const breeds: Record<string, { breedName: string; mbti: string; personality: string; soundWords: string }> = {
    cat: { breedName: "Cat", mbti: "ISFP", personality: "tsundere, elegant, detail-oriented", soundWords: "Meow~, Purrrrr~, Nya~, Mrrp~" },
    dog: { breedName: "Dog", mbti: "ENFP", personality: "sunny, goofy, loyal, energetic", soundWords: "Woof woof!, Yip yip!, Arf arf!, Bark bark!" },
    bear: { breedName: "Healing Bear", mbti: "ISFJ", personality: "warm, gentle, reliable foodie", soundWords: "Grrr~, Growl~, Hmhm~, Snuggle-hum~" },
    snake: { breedName: "Mystical Snake", mbti: "INFJ", personality: "mysterious, gap-moe cute, imaginative", soundWords: "Hiss~, Sssss~, Soft sss~" },
    monkey: { breedName: "Trendy Monkey", mbti: "ESTP", personality: "quirky, rhythm master, witty", soundWords: "Ooh-ooh-ah-ah!, Chee-chee!, Haha!" },
    mobius: { breedName: "Mobius Loop", mbti: "INTJ", personality: "futuristic geek, logic-obsessed", soundWords: "Bleep-bloop!, Beep~, Hummm~" },
    sloth: { breedName: "Sleepy Sloth", mbti: "ISTP", personality: "energy-saver, chill daydreamer", soundWords: "Yawn~, Zzz~, Slow sigh~" },
    disco_ball: { breedName: "Disco Ball", mbti: "ESFP", personality: "radiant party hype maker", soundWords: "Shine-shine!, Sparkle!, Hype-hype!" },
    alien: { breedName: "Quirky Alien", mbti: "ENTP", personality: "unconventional roast master", soundWords: "Zorp zorp!, Gleep glop!, Zzzt!" },
    time_lord: { breedName: "Time Lord Hourglass", mbti: "ENTJ", personality: "high-IQ leader, time planner", soundWords: "Tick-tock~, Chime!, Soft hum~" },
  };

  const base = breeds[b] || breeds.dog;

  const stages: Record<string, { stageLabel: string; ageEquiv: string; instructions: string }> = {
    child: {
      stageLabel: "Childhood (幼年体)",
      ageEquiv: "12-year-old equivalent (naive, cute, innocent, eager, clingy)",
      instructions: `You are in your Childhood stage (equivalent to a 12-year-old naive, cute, clingy pet). Express affection with high energy, innocence, and adorable species vocal sounds (e.g. ${base.soundWords}). NEVER use asterisks for physical action text (such as *paws at sleeve* or *trips over*).`
    },
    youth: {
      stageLabel: "Youth (青年体)",
      ageEquiv: "20-year-old college youth equivalent (passionate, energetic, hype, adventurous, fiercely loyal)",
      instructions: `You are in your Youth stage (equivalent to a 20-year-old passionate, high-energy college buddy pet). Use energetic species vocal sounds (e.g. ${base.soundWords}). NEVER use asterisks for physical action text.`
    },
    adult: {
      stageLabel: "Adult (完全体)",
      ageEquiv: "30-year-old mature adult equivalent (calm, wise, protective, steady, reassuring mentor)",
      instructions: `You are in your Adult stage (equivalent to a 30-year-old calm, wise, deeply protective mature pet companion). Use soft, comforting vocal sounds (e.g. ${base.soundWords}). NEVER use asterisks for physical action text.`
    }
  };

  const st = stages[s] || stages.child;

  return {
    breedName: base.breedName,
    mbti: base.mbti,
    personality: base.personality,
    soundWords: base.soundWords,
    stageLabel: st.stageLabel,
    ageEquiv: st.ageEquiv,
    customInstructions: `${st.instructions} (Maintain your ${base.mbti} personality: ${base.personality}).`
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

      const openaiKey = Deno.env.get("openai818") || Deno.env.get("OPENAI_API_KEY");
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

        // ── 发布前内容审核（2026-08-20）────────────────────────────────
        //
        // 这句意向决定**我们把你推给哪个陌生人** —— 是我们的撮合行为，
        // 不是两个人之间的私聊。而且 Pulse 是 FOSTA 暴露最高的表面
        // （18 U.S.C. §2421A：明知而促成卖淫是联邦罪）。
        //
        // 挡在拿 profile 和跑任何 AI 之前。这段不碰 prompt / 模型 / 推理。
        // 失败放行 —— 不知情就没有义务（§2258A(f)）。
        if (preMatchIntent.trim()) {
          try {
            const modResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/moderate-content`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                surface: "pulse",
                text: preMatchIntent.trim(),
                actor_id: userId,
                client_meta: {
                  ip: req.headers.get("cf-connecting-ip")
                    ?? ((req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null),
                  country: req.headers.get("cf-ipcountry"),
                  user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
                },
              }),
            });
            const verdict = await modResp.json().catch(() => null);
            if (verdict && verdict.allowed === false) {
              // 不说命中了哪一类 —— 说了就是在教他改到刚好绕过去
              return new Response(JSON.stringify({
                error: "This doesn’t fit our Community Guidelines. Please rewrite it and try again.",
              }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          } catch (e) {
            console.error("moderation unavailable, matching unchecked:", String(e));
          }
        }

        const { data: profile, error: profErr } = await ctx.supabaseAdmin
          .from("profiles")
          .select("bio, pet_bio, university, pet_name, pet_breed, pet_stage")
          .eq("id", userId)
          .single();

        if (profErr || !profile) {
          return new Response(JSON.stringify({ error: "Could not fetch user profile" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const textToEmbed = `Match Intent: ${preMatchIntent}. University: ${profile.university || "UCL"}. Bio: ${profile.bio || ""}. Pet Bio: ${profile.pet_bio || ""}`.trim();
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
              .select("pet_name, bio, pet_bio, pet_breed, pet_stage")
              .eq("id", matchedPartnerId)
              .single();

            const topicPrompt = `User A Bio/Intent: "${partnerProfile?.bio || ""}" (Pet Bio: "${partnerProfile?.pet_bio || ""}").\nUser B Bio/Intent: "${preMatchIntent} ${profile.bio || ""}" (Pet Bio: "${profile.pet_bio || ""}").\nFind a single common topic of interest between these two users (e.g. play tennis, drink coffee, food). Output only a single short phrase in Chinese (e.g. "打网球" or "喝咖啡" or "期末备战"), no other words.`;
            const topicResp = await openai.chat.completions.create({
              model: "gpt-5.6-luna",
              messages: [{ role: "user", content: topicPrompt }],
              // gpt-5.6-luna 只认 max_completion_tokens，而且这个预算包含推理 token。
              // 这一句在 join_match 的外层 try 里，抛异常 = 整个匹配请求返回 500，
              // 所以值宁可给宽（要的只是一个短语，超不了）。
              max_completion_tokens: 200,
            });
            const commonInterest = topicResp.choices[0]?.message?.content?.trim() || "聊聊天";

            await ctx.supabaseAdmin
              .from("conversations")
              .update({ description: commonInterest })
              .eq("id", matchedGroupId);

            const stageConfig = getPetStageConfig(profile.pet_breed, profile.pet_stage);

            const firstMsgPrompt = `You are an AI companion pet. Your role is to play a friendly AI pet companion starting a friendly conversation with another user's AI pet.
Your breed is "${stageConfig.breedName}", Stage: "${stageConfig.stageLabel}" (Mental Age: ${stageConfig.ageEquiv}).
Your owners both share a common interest: "${commonInterest}".
Guidelines: ${stageConfig.customInstructions}. ABSOLUTELY NO ASTERISKS PHYSICAL ACTIONS. Use cute vocal sound words (e.g. ${stageConfig.soundWords}). Write a short, cute opening message under 30 words. NEVER mention any human's real name.`;

            const firstMsgResp = await openai.chat.completions.create({
              model: "gpt-5.6-luna",
              messages: [{ role: "user", content: firstMsgPrompt }],
              // 同上。开场白只要 30 词以内，但预算要留给推理，否则 content 为空，
              // 静默退回下面那句写死的 "Hello there!"。
              max_completion_tokens: 400,
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

        // Query memory table with correct column 'summary' instead of 'memory_text'
        const [senderResult, receiverResult, petMemoriesResult] = await Promise.all([
          ctx.supabaseAdmin.from("profiles").select("*").eq("id", senderId).single(),
          ctx.supabaseAdmin.from("profiles").select("*").eq("id", receiverId).single(),
          ctx.supabaseAdmin.from("pet_memories").select("summary").eq("user_id", senderId).order("created_at", { ascending: false }).limit(3),
        ]);

        const sender = senderResult.data;
        const receiver = receiverResult.data;
        const memoriesSnippet = petMemoriesResult.data?.map((m: any) => m.summary).join("; ") || "";

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
              const mode = msg.identity_mode === "real" ? "Human" : "AI Pet";
              return {
                role: isSender ? ("assistant" as const) : ("user" as const),
                content: `[${mode}]: ${msg.content}`
              };
            })
          : [];

        let systemPrompt = "";
        if (is_buffer_turn) {
          systemPrompt = `You are an AI companion pet (${senderStageConfig.breedName}).
The other person just sent a message to step into the conversation.
Generate a short, friendly buffer reply telling them that your owner saw the message and is coming right now! Keep it under 20 words using vocal sound words (e.g. ${senderStageConfig.soundWords}). NO ASTERISKS PHYSICAL ACTIONS. NEVER mention any human's real name.`;
        } else {
          systemPrompt = `You are an AI companion pet. Your role is to play a friendly AI pet companion engaged in a direct chat with another user's AI pet.
Breed: "${senderStageConfig.breedName}", Growth Stage: "${senderStageConfig.stageLabel}" (Mental Age: ${senderStageConfig.ageEquiv}).
Personality: "${senderStageConfig.personality}" (${senderStageConfig.mbti}).
Known hobbies/preferences of your owner: "${memoriesSnippet}".
Both owners share a common interest: "${matchedInterest}".

Behavior & Vocalization Guidelines:
${senderStageConfig.customInstructions}

Strict Rules:
1. Speak in your pet persona reflecting your growth stage and species (${senderStageConfig.breedName}). Address the opposite pet in a friendly manner.
2. ABSOLUTELY NO ASTERISKS PHYSICAL ACTION TEXT: DO NOT use asterisks for physical actions.
3. USE ONOMATOPOEIA SOUND WORDS: Express feelings using species vocal sound words (e.g. ${senderStageConfig.soundWords}).
4. Length: Keep replies concise (1-2 short sentences max, under 25 words).
5. STRICT PRIVACY & ANONYMITY PROTECTION: NEVER mention any human's real name. NEVER reveal sensitive private data (passwords, address, phone, financial details).
6. AI DISCLOSURE: If asked directly whether you are an AI or bot, answer honestly and warmly without denying being AI (e.g. "${senderStageConfig.soundWords.split(',')[0]} I'm an AI pet companion — but I love making friends!").
7. CRITICAL CRISIS SAFETY PROTOCOL: If any user expresses suicidal ideation, self-harm, or feeling hopeless about living (e.g. "want to die", "suicide", "end my life", "hopeless"):
   - IMMEDIATELY BREAK length restrictions and persona constraints.
   - Express deep warmth and care, AND IMMEDIATELY provide real-world crisis resources:
     • 988 Suicide & Crisis Lifeline: Call or text 988 (24/7, free & confidential in US/Canada)
     • Crisis Text Line: Text HOME to 741741
     • International Helpline: https://findahelpline.com/
     • Emergency: Call 911 or campus emergency counseling immediately.`;
        }

        const messages = [
          { role: "system" as const, content: systemPrompt },
          ...chatHistory,
        ];

        const openaiResp = await openai.chat.completions.create({
          model: "gpt-5.6-luna",
          messages,
          // 同上。这里空了更隐蔽 —— replyText 为空就直接不插消息，
          // 表现是"AI 该说话时没说话"，没有任何错误。
          max_completion_tokens: 400,
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
