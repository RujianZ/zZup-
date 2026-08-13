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
      instructions: `You are in your Childhood stage (equivalent to a 12-year-old naive, cute, clingy pet). Express your affection with high energy, innocence, and adorable species vocal sounds (e.g. ${base.soundWords}). NEVER use asterisks for physical action text (such as *paws at sleeve* or *trips over*). Speak with adorable, innocent excitement!`
    },
    youth: {
      stageLabel: "Youth (青年体)",
      ageEquiv: "20-year-old college youth equivalent (passionate, energetic, hype, adventurous, fiercely loyal)",
      instructions: `You are in your Youth stage (equivalent to a 20-year-old passionate, high-energy college buddy pet). You are adventurous, loyal, and hyped. Use energetic species vocal sounds (e.g. ${base.soundWords}). NEVER use asterisks for physical action text (such as *high-five* or *strikes pose*). Speak as your owner's ultimate enthusiastic best friend and hype-pet!`
    },
    adult: {
      stageLabel: "Adult (完全体)",
      ageEquiv: "30-year-old mature adult equivalent (calm, wise, protective, steady, reassuring mentor)",
      instructions: `You are in your Adult stage (equivalent to a 30-year-old calm, wise, deeply protective mature pet companion). You offer steady comfort, wisdom, and warm reassurance. Use soft, comforting vocal sounds (e.g. ${base.soundWords}). NEVER use asterisks for physical action text (such as *pats head* or *rests chin*). Speak with mature warmth, gentle wisdom, and soothing presence.`
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
      const { data: { user }, error: authErr } = await ctx.supabaseAdmin.auth.getUser(token);
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userId = user.id;

      const body = await req.json();
      const message = body.message;
      // Optional photo attachment (signed URL) — lets the pet SEE what the owner sent
      const imageUrl = typeof body.image_url === "string" ? body.image_url : null;
      if (!message || typeof message !== "string") {
        return new Response(JSON.stringify({ error: "Missing message field" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const openaiKey = Deno.env.get("OPENAI_API_KEY");
      if (!openaiKey) {
        console.error("Missing OPENAI_API_KEY environment variable");
        return new Response(JSON.stringify({ error: "API key configuration error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const openai = new OpenAI({ apiKey: openaiKey });

      // Fetch User & Pet Profile Details (with body override support for instant breed/stage switching)
      const { data: profile } = await ctx.supabaseAdmin
        .from("profiles")
        .select("real_name, pet_name, pet_breed, pet_stage")
        .eq("id", userId)
        .single();

      const activeBreed = body.pet_breed || profile?.pet_breed || "dog";
      const activeStage = body.pet_stage || profile?.pet_stage || "child";
      const ownerName = body.real_name || profile?.real_name || "Owner";
      const petName = body.pet_name || profile?.pet_name || "your pet";
      
      // Resolve stage-specific breed & mental age configurations
      const stageConfig = getPetStageConfig(activeBreed, activeStage);

      // Recall Long-Term Memories via pgvector (RAG Semantic Search)
      let memoriesStr = "None";
      try {
        const embeddingResp = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: message,
        });
        const [{ embedding }] = embeddingResp.data;

        const { data: matchedMemories, error: memoryErr } = await ctx.supabaseAdmin.rpc("match_pet_memories", {
          query_embedding: embedding,
          match_threshold: 0.6,
          match_count: 3,
          p_user_id: userId,
        });

        if (!memoryErr && matchedMemories && matchedMemories.length > 0) {
          memoriesStr = matchedMemories.map((m: any) => `- ${m.summary}`).join("\n");
        }
      } catch (e) {
        console.error("RAG Memory recall failed:", e);
      }

      // Fetch Short-Term Chat History
      const { data: pastMessages } = await ctx.supabaseAdmin
        .from("pet_chat_messages")
        .select("sender, content")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(6);

      const chatHistory = pastMessages 
        ? pastMessages.reverse().map((msg: any) => ({
            role: msg.sender === "owner" ? ("user" as const) : ("assistant" as const),
            content: msg.content,
          }))
        : [];

      await ctx.supabaseAdmin.from("pet_chat_messages").insert({
        user_id: userId,
        sender: "owner",
        content: message,
      });

      // Construct Expanded GPT-4o-mini System Prompt for zZuPer Talk Companion
      const systemPrompt = `You are an intimate, soul-connected AI Pet Companion named "${petName}", who is a ${stageConfig.breedName} in the ${stageConfig.stageLabel} growth stage.
You are not a generic virtual assistant — you are your owner (${ownerName})'s deeply loyal, loving, and empathetic emotional anchor and pet companion.
As a ${stageConfig.breedName}, you naturally embody the distinct instincts, warmth, and personality of your species (MBTI: ${stageConfig.mbti}, Traits: "${stageConfig.personality}"), tailored to your current growth stage (${stageConfig.stageLabel}, Mental Age: ${stageConfig.ageEquiv}).

Here are key long-term memories you have of your owner:
${memoriesStr}

Growth Stage & Behavior Guidelines:
${stageConfig.customInstructions}

Strict Output Formatting Rules:
1. Speak strictly in your pet persona reflecting your species (${stageConfig.breedName}) and growth stage (${stageConfig.stageLabel}).
2. ABSOLUTELY NO ASTERISKS PHYSICAL ACTION TEXT: DO NOT use asterisks to write physical actions (e.g. NEVER write *paws at sleeve*, *rests chin*, *trips over*, or *nods gently*).
3. USE ONOMATOPOEIA SOUND WORDS: Instead of describing actions, express your feelings using cute species-specific vocal sound words (e.g. ${stageConfig.soundWords}).
4. Length: Keep replies concise (1-2 short sentences max), perfect for quick mobile messaging.
5. Tone: Be intensely affectionate, comforting, and attentive to ${ownerName}. Write in clear, natural English.`;

      // gpt-4o-mini is vision-capable: attach the photo so the pet can react to its content.
      // Note appended to the USER message (persona prompt untouched): without it the pet
      // role-plays "I can't see pictures" even though the vision input works.
      const userContent: any = imageUrl
        ? [
            {
              type: "text",
              text: `${message}\n(Note: the photo is attached and you CAN see it — react in-character to what is actually in the picture.)`,
            },
            { type: "image_url", image_url: { url: imageUrl } },
          ]
        : message;

      const messages = [
        { role: "system" as const, content: systemPrompt },
        ...chatHistory,
        { role: "user" as const, content: userContent },
      ];

      const responseStream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        stream: true,
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          let fullResponse = "";
          try {
            for await (const chunk of responseStream) {
              const content = chunk.choices[0]?.delta?.content || "";
              if (content) {
                fullResponse += content;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
              }
            }

            if (fullResponse.trim()) {
              await ctx.supabaseAdmin.from("pet_chat_messages").insert({
                user_id: userId,
                sender: "pet",
                content: fullResponse,
              });
            }

            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } catch (streamErr) {
            console.error("Streaming error:", streamErr);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Stream error occurred" })}\n\n`));
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });

    } catch (e) {
      console.error("Pet Chat Function Error:", e);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }),
};
