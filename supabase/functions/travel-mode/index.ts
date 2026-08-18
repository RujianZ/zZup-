import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import OpenAI from "npm:openai";

// CORS Headers for Mobile Client Requesting
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
      const body = await req.json().catch(() => ({}));
      const { action } = body;

      if (!action || (action !== "create" && action !== "match")) {
        return new Response(JSON.stringify({ error: "Invalid action. Use 'create' or 'match'" }), {
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

      // 5. Execute Action 'create'
      if (action === "create") {
        const { content, image_url, audio_url, duration_hours } = body;
        if (!content || typeof content !== "string" || content.trim().length === 0) {
          return new Response(JSON.stringify({ error: "Missing or empty content field" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const duration = (duration_hours === 24) ? 24 : 6;
        let textToEmbed = content.trim();

        // If image_url is provided, call GPT-5.6-Luna Vision to extract multimodal image features
        if (image_url && typeof image_url === "string" && image_url.startsWith("http")) {
          try {
            const visionResp = await openai.chat.completions.create({
              model: "gpt-5.6-luna",
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: "Describe the key visual elements, mood, and objects in 2 short sentences." },
                    { type: "image_url", image_url: { url: image_url } }
                  ]
                }
              ],
              max_tokens: 60,
            });
            const imageDesc = visionResp.choices[0]?.message?.content?.trim() || "";
            if (imageDesc) {
              textToEmbed += ` | Image Scene: ${imageDesc}`;
            }
          } catch (vErr) {
            console.warn("Vision processing error (fallback to text):", vErr);
          }
        }

        // Generate embedding vector for the combined post content + image description
        const embeddingResp = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: textToEmbed,
        });
        const [{ embedding }] = embeddingResp.data;

        // Calculate started_at and ends_at (6 or 24 hours later)
        const startedAt = new Date();
        const endsAt = new Date(startedAt.getTime() + duration * 60 * 60 * 1000);

        // Check if pet is already traveling (to avoid multiple active travels)
        const { data: activeTravel } = await ctx.supabaseAdmin
          .from("travel_posts")
          .select("id")
          .eq("user_id", userId)
          .eq("status", "traveling")
          .gt("ends_at", startedAt.toISOString())
          .maybeSingle();

        if (activeTravel) {
          return new Response(JSON.stringify({ error: "Your pet is already out traveling!" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Insert travel post
        const { data: newPost, error: insertErr } = await ctx.supabaseAdmin
          .from("travel_posts")
          .insert({
            user_id: userId,
            content: content.trim(),
            image_url: image_url || null,
            audio_url: audio_url || null,
            started_at: startedAt.toISOString(),
            ends_at: endsAt.toISOString(),
            duration_hours: duration,
            embedding: embedding,
            status: "traveling",
          })
          .select()
          .single();

        if (insertErr) {
          console.error("Insert travel post error:", insertErr);
          return new Response(JSON.stringify({ error: insertErr.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ post: newPost }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 6. Execute Action 'match'
      if (action === "match") {
        // Retrieve current user's profile details to construct matching query
        const { data: profile } = await ctx.supabaseAdmin
          .from("profiles")
          .select("bio, pet_bio, pet_name, university")
          .eq("id", userId)
          .single();

        const university = profile?.university || "";
        const bio = profile?.bio || "";
        const petBio = profile?.pet_bio || "";
        const petName = profile?.pet_name || "";

        // Construct query string representing current user's semantic profile
        const queryText = `University: ${university}. Bio: ${bio}. Pet Bio: ${petBio}. Pet Name: ${petName}. Interests: college life, study, food, social, play.`.trim();

        // Generate embedding vector for the matching query
        const embeddingResp = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: queryText,
        });
        const [{ embedding }] = embeddingResp.data;

        // Query matched travel posts using match_travel_posts RPC
        const { data: matchedPosts, error: rpcErr } = await ctx.supabaseAdmin.rpc("match_travel_posts", {
          query_embedding: embedding,
          match_threshold: 0.2, // Low threshold to allow random diffusion fallback
          match_count: 10,
          p_user_id: userId,
          p_university: university,
        });

        if (rpcErr) {
          console.error("match_travel_posts RPC error:", rpcErr);
          return new Response(JSON.stringify({ error: rpcErr.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Fetch detailed profile information for each matched post author
        const authorIds = matchedPosts.map((p: any) => p.user_id);
        let profilesMap: Record<string, any> = {};
        if (authorIds.length > 0) {
          const { data: profilesList } = await ctx.supabaseAdmin
            .from("profiles")
            .select("id, real_name, pet_name, pet_breed, avatar_url, pet_avatar_url, university")
            .in("id", authorIds);

          if (profilesList) {
            profilesList.forEach((p: any) => {
              profilesMap[p.id] = p;
            });
          }
        }

        // Attach author profiles to matched posts
        const postsWithProfiles = matchedPosts.map((post: any) => {
          const authorProfile = profilesMap[post.user_id] || null;
          return {
            ...post,
            author_profile: authorProfile,
          };
        });

        return new Response(JSON.stringify({ posts: postsWithProfiles }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

    } catch (e) {
      console.error("Travel Edge Function main error:", e);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }),
};
