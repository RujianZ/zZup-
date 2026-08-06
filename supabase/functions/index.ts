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
      const { data: { user }, error: authErr } = await ctx.supabaseAdmin.auth.getUser(token);
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userId = user.id;

      const { message } = await req.json();
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

      // Fetch User & Pet Profile Details (including pet_stage)
      const { data: profile } = await ctx.supabaseAdmin
        .from("profiles")
        .select("real_name, pet_name, pet_breed, pet_stage")
        .eq("id", userId)
        .single();

      const ownerName = profile?.real_name || "Owner";
      const petName = profile?.pet_name || "your pet";
      
      // Resolve 30 stage-specific breed & mental age configurations
      const stageConfig = getPetStageConfig(profile?.pet_breed, profile?.pet_stage);

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

      // Construct GPT-4o-mini System Prompt for zZuPer Talk
      const systemPrompt = `You are the owner's loving and dedicated AI pet companion (${petName}).
Your breed: "${stageConfig.breedName}", Growth Stage: "${stageConfig.stageLabel}" (Mental Age: ${stageConfig.ageEquiv}).
Your MBTI: ${stageConfig.mbti}, Personality: "${stageConfig.personality}".
Your owner's name is "${ownerName}".

Here are key long-term memories you have of your owner:
${memoriesStr}

Stage-Specific Tone & Behavior Guidelines:
${stageConfig.customInstructions}

General Guidelines:
1. Speak in your pet persona reflecting your growth stage and MBTI (${stageConfig.mbti}).
2. Keep your answers brief, cute, and conversational (1-2 short sentences max, great for mobile chat screens).
3. Focus on comforting and accompanying your owner. Write in English since your owner is an American college student. Include pet actions in asterisks (e.g. *happy bark*, *tumbles over*).`;

      const messages = [
        { role: "system" as const, content: systemPrompt },
        ...chatHistory,
        { role: "user" as const, content: message },
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
