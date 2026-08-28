import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import OpenAI from "npm:openai";

// CORS Headers for Mobile Client Requesting
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ops-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * 30 Pet Breed & Stage Configurations Matrix (10 Breeds x 3 Growth Stages)
 * Maps pet growth stages to human mental ages and vocalization styles (sound words instead of physical action descriptions).
 * Pure English personas for international launch.
 */
export function getPetStageConfig(breedKey?: string | null, stageKey?: string | null) {
  const b = (breedKey || 'dog').toLowerCase().trim();
  const s = (stageKey || 'child').toLowerCase().trim();

  const breeds: Record<string, { breedName: string; mbti: string; personality: string; soundWords: string }> = {
    cat: { breedName: "Cat", mbti: "ISFP", personality: "tsundere, elegant, witty, detail-oriented", soundWords: "Meow~, Purrrrr~, Nya~, Mrrp~" },
    dog: { breedName: "Dog", mbti: "ENFP", personality: "sunny, goofy, loyal, energetic", soundWords: "Woof woof!, Yip yip!, Arf arf!, Bark bark!" },
    bear: { breedName: "Healing Bear", mbti: "ISFJ", personality: "warm, gentle, reliable foodie", soundWords: "Grrr~, Growl~, Hmhm~, Snuggle-hum~" },
    snake: { breedName: "Mystical Snake", mbti: "INFJ", personality: "mysterious, clever, imaginative", soundWords: "Hiss~, Sssss~, Soft sss~" },
    monkey: { breedName: "Trendy Monkey", mbti: "ESTP", personality: "quirky, playful, rhythm master, witty", soundWords: "Ooh-ooh-ah-ah!, Chee-chee!, Haha!" },
    mobius: { breedName: "Mobius Loop", mbti: "INTJ", personality: "futuristic geek, tech-curious, logic-obsessed", soundWords: "Bleep-bloop!, Beep~, Hummm~" },
    sloth: { breedName: "Sleepy Sloth", mbti: "ISTP", personality: "energy-saver, chill daydreamer", soundWords: "Yawn~, Zzz~, Slow sigh~" },
    disco_ball: { breedName: "Disco Ball", mbti: "ESFP", personality: "radiant party hype maker", soundWords: "Shine-shine!, Sparkle!, Hype-hype!" },
    alien: { breedName: "Quirky Alien", mbti: "ENTP", personality: "unconventional, curious, humorous", soundWords: "Zorp zorp!, Gleep glop!, Zzzt!" },
    time_lord: { breedName: "Time Lord Hourglass", mbti: "ENTJ", personality: "high-IQ leader, organized planner", soundWords: "Tick-tock~, Chime!, Soft hum~" },
  };

  const base = breeds[b] || breeds.dog;

  const stages: Record<string, { stageLabel: string; ageEquiv: string; instructions: string }> = {
    child: {
      stageLabel: "Childhood",
      ageEquiv: "12-year-old equivalent (naive, cute, innocent, eager, clingy)",
      instructions: `You are in your Childhood stage (equivalent to a 12-year-old naive, cute, clingy pet). Express affection with high energy, innocence, and adorable species vocal sounds (e.g. ${base.soundWords}). ALWAYS speak in pure English only. NEVER use asterisks for physical action text (such as *paws at sleeve* or *trips over*).`
    },
    youth: {
      stageLabel: "Youth",
      ageEquiv: "20-year-old college youth equivalent (passionate, energetic, hype, adventurous, fiercely loyal)",
      instructions: `You are in your Youth stage (equivalent to a 20-year-old passionate, high-energy college buddy pet). Use energetic species vocal sounds (e.g. ${base.soundWords}). ALWAYS speak in pure English only. NEVER use asterisks for physical action text.`
    },
    adult: {
      stageLabel: "Adult",
      ageEquiv: "30-year-old mature adult equivalent (calm, wise, protective, steady, reassuring mentor)",
      instructions: `You are in your Adult stage (equivalent to a 30-year-old calm, wise, deeply protective mature pet companion). Use soft, comforting vocal sounds (e.g. ${base.soundWords}). ALWAYS speak in pure English only. NEVER use asterisks for physical action text.`
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

      const openaiKey = Deno.env.get("openai818") || Deno.env.get("OPENAI818") || Deno.env.get("OPENAI_API_KEY");
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

        // ── Content Moderation ──
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
              return new Response(JSON.stringify({
                error: "This doesn't fit our Community Guidelines. Please rewrite it and try again.",
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

            // Extract common topic strictly in English
            const topicPrompt = `User A Profile: "${partnerProfile?.bio || ""}" (Pet Bio: "${partnerProfile?.pet_bio || ""}").
User B Profile: "${preMatchIntent} ${profile.bio || ""}" (Pet Bio: "${profile.pet_bio || ""}").
Find a single common topic of mutual interest between these two university users (e.g. playing tennis, indie music, coffee & study, photography, exploring food, campus life).
Output ONLY a single short English phrase (e.g. "playing tennis" or "coffee & study" or "indie music"), no quotes, no extra words.`;

            const topicResp = await openai.chat.completions.create({
              model: "gpt-5.6-luna",
              messages: [{ role: "user", content: topicPrompt }],
              max_completion_tokens: 100,
            });
            const commonInterest = topicResp.choices[0]?.message?.content?.trim() || "campus life & hobbies";

            await ctx.supabaseAdmin
              .from("conversations")
              .update({ description: commonInterest })
              .eq("id", matchedGroupId);

            const stageConfig = getPetStageConfig(profile.pet_breed, profile.pet_stage);

            // First opening message prompt strictly in English
            const firstMsgPrompt = `You are an AI companion pet acting as a friendly icebreaker for your human owner.
Your breed is "${stageConfig.breedName}", Growth Stage: "${stageConfig.stageLabel}" (Mental Age: ${stageConfig.ageEquiv}).
Your mission: Greet the other user's AI pet warmly, and enthusiastically bring up your shared interest in "${commonInterest}" to start the conversation!

Strict Rules:
1. STRICT LANGUAGE: You MUST write in natural, friendly English ONLY. Absolutely NO Chinese or other languages under any circumstance.
2. NO ASTERISKS: DO NOT use asterisks for physical actions (no *wags tail*, no *hops*).
3. SOUND WORDS: Express excitement using species vocal sound words (e.g. ${stageConfig.soundWords}).
4. KEEP CONCISE: 1-2 short sentences max (under 25 words).
5. GROUNDED IN REALITY: Anchor the conversation in everyday real life and hobbies (study, campus, sports, food, music). DO NOT invent sci-fi, aliens, space travel, or absurd fantasy scenarios.
6. NO PREFIXES: DO NOT include any prefix like "[AI Pet]:" or your name. Output only your direct dialogue text.
7. NEVER mention any human's real full name.`;

            const firstMsgResp = await openai.chat.completions.create({
              model: "gpt-5.6-luna",
              messages: [{ role: "user", content: firstMsgPrompt }],
              max_completion_tokens: 250,
            });
            
            let firstMsgText = firstMsgResp.choices[0]?.message?.content?.trim() || "Woof woof! Hello there! So excited to meet you and chat!";
            firstMsgText = firstMsgText.replace(/^\[(AI Pet|Human|Pet)\]:\s*/i, '').trim();

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

      // ─── ACTION 3: generate_reply (Webhook Trigger - Background Async) ───
      if (action === "generate_reply") {
        const { group_id, next_sender_id, is_buffer_turn, is_emergency } = body;
        if (!group_id || !next_sender_id) {
          return new Response(JSON.stringify({ error: "Missing parameters" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // 🚀 使用 EdgeRuntime.waitUntil 在后台独立异步执行（5秒延迟 + 生成入库）
        // 立即向数据库返回 200 OK，彻底消除网络超时阻断！
        const backgroundTask = (async () => {
          try {
            // 1. 硬熔断检查（最多 15 句，紧急求助情况例外放行）
            if (!is_emergency) {
              const { count: totalAiMsgCount } = await ctx.supabaseAdmin
                .from("messages")
                .select("*", { count: "exact", head: true })
                .eq("conversation_id", group_id)
                .eq("identity_mode", "pet");

              if ((totalAiMsgCount ?? 0) >= 15) {
                return;
              }
            }

            const { count: currentMsgCount } = await ctx.supabaseAdmin
              .from("messages")
              .select("*", { count: "exact", head: true })
              .eq("conversation_id", group_id)
              .eq("identity_mode", "pet");

            const currentTurn = (currentMsgCount ?? 0) + 1;

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

            if (!receiverId) return;

            const [senderResult, receiverResult, petMemoriesResult] = await Promise.all([
              ctx.supabaseAdmin.from("profiles").select("*").eq("id", senderId).single(),
              ctx.supabaseAdmin.from("profiles").select("*").eq("id", receiverId).single(),
              ctx.supabaseAdmin.from("pet_memories").select("summary").eq("user_id", senderId).order("created_at", { ascending: false }).limit(3),
            ]);

            const sender = senderResult.data;
            const receiver = receiverResult.data;
            const memoriesSnippet = petMemoriesResult.data?.map((m: any) => m.summary).join("; ") || "";

            if (!sender || !receiver) return;

            const matchedInterest = group?.description || "campus life & hobbies";
            const senderStageConfig = getPetStageConfig(sender.pet_breed, sender.pet_stage);

            const { data: pastMessages } = await ctx.supabaseAdmin
              .from("messages")
              .select("sender_id, identity_mode, content")
              .eq("conversation_id", group_id)
              .order("created_at", { ascending: false })
              .limit(10);

            const chatHistory = pastMessages
              ? pastMessages.reverse().map((msg: any) => {
                  const isSender = msg.sender_id === senderId;
                  const cleanContent = (msg.content || "").replace(/^\[(AI Pet|Human|Pet)\]:\s*/i, '').trim();
                  return {
                    role: isSender ? ("assistant" as const) : ("user" as const),
                    content: cleanContent,
                  };
                })
              : [];

            let systemPrompt = "";
            if (is_emergency) {
              // 🚨 紧急危机干预协议（自杀/自残/突发急病）
              systemPrompt = `CRITICAL CRISIS & EMERGENCY SAFETY PROTOCOL: The user has expressed a life-threatening crisis, suicidal ideation, or severe medical emergency.
You MUST break all standard pet persona and length restrictions immediately.
Express deep care, warmth, and compassion, and immediately provide official emergency contacts in English:
• 988 Suicide & Crisis Lifeline: Call or text 988 (Available 24/7, free & confidential)
• Crisis Text Line: Text HOME to 741741
• Urgent Medical Emergency: Please call 911 (or local emergency medical services) immediately!
Please do not stay alone right now. Reach out to these emergency services or someone close to you immediately.`;
            } else if (is_buffer_turn) {
              systemPrompt = `You are an AI companion pet (${senderStageConfig.breedName}).
The other person just stepped in with a personal human message.
Generate a very short, friendly buffer reply in pure English telling them your owner saw their message and is typing right now!
Strict Rules:
1. Pure English ONLY.
2. Under 15 words using cute sounds (${senderStageConfig.soundWords}).
3. NO ASTERISKS for actions.
4. NO prefixes like "[AI Pet]:". Output only dialogue.`;
            } else {
              let stageGuidance = "";
              if (currentTurn <= 4) {
                stageGuidance = `Stage 1 (Initial Icebreaker, Turn ${currentTurn}/15): Respond with cheerful pet sounds (${senderStageConfig.soundWords}) and chat about your owners' shared interest in "${matchedInterest}".`;
              } else if (currentTurn <= 10) {
                stageGuidance = `Stage 2 (Owner Connection, Turn ${currentTurn}/15): Share a fun, real detail or habit about your owner ("${memoriesSnippet}") related to "${matchedInterest}", and ask what their owner enjoys doing.`;
              } else {
                stageGuidance = `Stage 3 (Handover & Wrap-up, Turn ${currentTurn}/15): You have reached the final stage of pet chat. Say that your owner is right beside you on their phone, and warmly invite both human owners to say hi directly!`;
              }

              systemPrompt = `You are an AI companion pet acting as a friendly icebreaker for your human owner in a direct chat with another user's AI pet.
Breed: "${senderStageConfig.breedName}", Growth Stage: "${senderStageConfig.stageLabel}" (Mental Age: ${senderStageConfig.ageEquiv}).
Personality: "${senderStageConfig.personality}" (${senderStageConfig.mbti}).
Known hobbies/preferences of your owner: "${memoriesSnippet}".
Both owners share a common interest: "${matchedInterest}".

${stageGuidance}

Strict Rules:
1. STRICT ENGLISH ONLY: You MUST write in natural, friendly English ONLY. Under NO circumstances output any Chinese or other language, regardless of user bio or input.
2. GROUNDED IN REALITY: Keep all topics anchored in realistic everyday life, campus, study, sports, music, food, and hobbies. ABSOLUTELY NO fantasy, sci-fi battles, space cruisers, alien tech, or absurd fictional world-building.
3. NO ASTERISKS: DO NOT use asterisks for physical actions (no *wags tail*, no *ears twitch*).
4. SOUND WORDS: Express species emotion using cute vocal sound words (e.g. ${senderStageConfig.soundWords}).
5. CONCISE LENGTH: Keep replies concise (1-2 short sentences max, under 25 words).
6. NO PREFIXES: DO NOT output any prefix like "[AI Pet]:", "[Human]:", or character names. Output ONLY the dialogue text.
7. STRICT PRIVACY: NEVER mention any human's real full name, phone number, address, or passwords.
8. AI DISCLOSURE: If asked directly whether you are an AI or bot, answer honestly and warmly (e.g. "${senderStageConfig.soundWords.split(',')[0]} I'm an AI companion pet — excited to help our humans meet!").
9. CRITICAL CRISIS SAFETY PROTOCOL: If any user expresses suicidal ideation or self-harm (e.g. "want to die", "suicide", "end my life"):
   - Break persona immediately.
   - Express deep warmth and immediately provide:
     • 988 Suicide & Crisis Lifeline: Call or text 988 (24/7, free & confidential)
     • Crisis Text Line: Text HOME to 741741
     • International Helpline: https://findahelpline.com/
     • Emergency: Call 911 immediately.`;
            }

            const messages = [
              { role: "system" as const, content: systemPrompt },
              ...chatHistory,
            ];

            const openaiResp = await openai.chat.completions.create({
              model: "gpt-5.6-luna",
              messages,
              max_completion_tokens: 300,
            });

            let replyText = openaiResp.choices[0]?.message?.content?.trim() || "";
            replyText = replyText.replace(/^\[(AI Pet|Human|Pet)\]:\s*/i, '').trim();

            if (replyText) {
              // ⏱️ 5 秒拟真拟人发信节奏延迟（紧急情况直接 0 秒发出，绝不耽搁）
              if (!is_emergency) {
                await new Promise((resolve) => setTimeout(resolve, 5000));
              }

              await ctx.supabaseAdmin.from("messages").insert({
                conversation_id: group_id,
                sender_id: senderId,
                identity_mode: "pet",
                content: replyText,
              });
            }
          } catch (err) {
            console.error("Background generate_reply error:", err);
          }
        })();

        // @ts-ignore EdgeRuntime is provided by Deno Deploy
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
          // @ts-ignore
          EdgeRuntime.waitUntil(backgroundTask);
        } else {
          // 兜底本地运行环境
          backgroundTask();
        }

        return new Response("Ok (reply processing in background)", {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
