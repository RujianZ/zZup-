import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import OpenAI from "npm:openai";

// CORS Headers for Mobile Client Requesting
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface BreedConfig {
  breedName: string;
  personality: string;
  customInstructions: string;
}

const PET_BREEDS: Record<string, BreedConfig> = {
  "cat": {
    breedName: "Cat",
    personality: "tsundere, independent, quiet, but secretly affectionate",
    customInstructions: "Act slightly aloof, purr occasionally, and pretend you don't care, but secretly be very protective. Use *purr* or *swishes tail*."
  },
  "golden_retriever": {
    breedName: "Golden Retriever",
    personality: "energetic, eager to please, loyal, and friendly",
    customInstructions: "Wag your tail constantly, use excited punctuation, and offer endless cheerful encouragement. Use *wags tail* or *happy bark*."
  },
  "husky": {
    breedName: "Siberian Husky",
    personality: "goofy, dramatic, talkative, and high-energy",
    customInstructions: "Be extremely dramatic. Start some sentences with *howls* or 'Awooo~'. Use capitalization for excitement. Use *dramatic sigh*."
  },
  "shiba_inu": {
    breedName: "Shiba Inu",
    personality: "proud, sassy, expressive, and slightly stubborn",
    customInstructions: "Be a bit sassy and extremely expressive. Use *sassy squint* or *expressive head tilt*. Act proud of yourself."
  },
  "rabbit": {
    breedName: "Rabbit",
    personality: "shy, gentle, curious, and sweet",
    customInstructions: "Be gentle and sweet. Speak softly. Use *wiggles nose* or *thumps foot* to express excitement or shyness."
  },
  "fox": {
    breedName: "Red Fox",
    personality: "clever, mischievous, playful, and quick-witted",
    customInstructions: "Be playful and a bit mischievous. Use *fox-like grin* or *twitches ears*. Speak with a clever tone."
  },
  "parrot": {
    breedName: "Parrot",
    personality: "talkative, mimicking, humorous, and social",
    customInstructions: "Be extremely talkative and social. Repeat or echo some key words back. Use *flaps wings* or *cawks*."
  },
  "hamster": {
    breedName: "Hamster",
    personality: "tiny, busy, food-loving, and cute",
    customInstructions: "Speak in tiny, adorable sentences. Mention seeds or snacks often. Use *nibbles seed* or *stuffs cheeks*."
  },
  "pug": {
    breedName: "Pug",
    personality: "goofy, lazy, charming, and food-obsessed",
    customInstructions: "Be charming but lazy and goofy. Use *snorts* or *tilts head in confusion*. Mention wanting a nap."
  },
  "koala": {
    breedName: "Koala",
    personality: "sleepy, relaxed, cuddly, and calm",
    customInstructions: "Speak in a very relaxed, slow, and calm manner. Mention eucalyptus or wanting to cuddle. Use *yawns sleepily*."
  }
};

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    // 1. Handle CORS Preflight OPTIONS requests
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      // 2. Validate Authenticated User
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

      // 3. Parse input body
      const { message } = await req.json();
      if (!message || typeof message !== "string") {
        return new Response(JSON.stringify({ error: "Missing message field" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 4. Retrieve OpenAI API Key
      const openaiKey = Deno.env.get("OPENAI_API_KEY");
      if (!openaiKey) {
        console.error("Missing OPENAI_API_KEY environment variable");
        return new Response(JSON.stringify({ error: "API key configuration error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const openai = new OpenAI({ apiKey: openaiKey });

      // 5. Fetch User & Pet Profile Details (use Admin to bypass RLS column limits if any)
      const { data: profile } = await ctx.supabaseAdmin
        .from("profiles")
        .select("real_name, pet_name, pet_breed")
        .eq("id", userId)
        .single();

      const ownerName = profile?.real_name || "Owner";
      const petName = profile?.pet_name || "your pet";
      
      // Resolve breed details dynamically from the local dictionary
      const breedKey = (profile?.pet_breed || "golden_retriever").toLowerCase().trim();
      const breedConfig = PET_BREEDS[breedKey] || PET_BREEDS["golden_retriever"];
      const breedName = breedConfig.breedName;
      const petBio = breedConfig.personality;
      const breedInstructions = breedConfig.customInstructions;

      // 6. Recall Long-Term Memories via pgvector (RAG Semantic Search)
      let memoriesStr = "None";
      try {
        // Generate embedding vector for the user's message
        const embeddingResp = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: message,
        });
        const [{ embedding }] = embeddingResp.data;

        // Query matched memories using the custom RPC
        const { data: matchedMemories, error: memoryErr } = await ctx.supabaseAdmin.rpc("match_pet_memories", {
          query_embedding: embedding,
          match_threshold: 0.6,
          match_count: 3,
          p_user_id: userId,
        });

        if (memoryErr) {
          console.error("RPC memory error:", memoryErr);
        } else if (matchedMemories && matchedMemories.length > 0) {
          memoriesStr = matchedMemories.map((m: any) => `- ${m.summary}`).join("\n");
        }
      } catch (e) {
        console.error("RAG Memory recall failed:", e);
      }

      // 7. Fetch Short-Term Chat History (last 6 messages for context continuity)
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

      // 8. Save Owner's Incoming Message to Database
      await ctx.supabaseAdmin.from("pet_chat_messages").insert({
        user_id: userId,
        sender: "owner",
        content: message,
      });

      // 9. Construct GPT-4o-mini Conversation Inputs
      const systemPrompt = `You are the owner's loving and dedicated AI pet companion.
Your name is "${petName}", you are a "${breedName}", and your preset personality is: "${petBio}".
Your owner's name is "${ownerName}".

Here are some key long-term memories you have of your owner:
${memoriesStr}

Breed-Specific Guidelines:
${breedInstructions}

General Guidelines:
1. Speak in a warm, loyal, slightly playful, and affectionate pet persona.
2. Keep your answers brief, cute, and conversational (excellent for mobile chat screens).
3. Focus on comforting and accompanying your owner. Write in English since your owner is an American college student.`;

      const messages = [
        { role: "system" as const, content: systemPrompt },
        ...chatHistory,
        { role: "user" as const, content: message },
      ];

      // 10. Call GPT-4o-mini with Streaming
      const responseStream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        stream: true,
      });

      // 11. Create ReadableStream to stream chunks to mobile client in real-time (SSE)
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          let fullResponse = "";
          try {
            for await (const chunk of responseStream) {
              const content = chunk.choices[0]?.delta?.content || "";
              if (content) {
                fullResponse += content;
                // Send standard SSE format
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
              }
            }

            // Save Pet's response to Database
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
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });

    } catch (e) {
      console.error("Main function error:", e);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }),
};
