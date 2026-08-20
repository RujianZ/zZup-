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
      const openaiKey = Deno.env.get("openai818") || Deno.env.get("OPENAI_API_KEY");
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

        // ── 发布前内容审核（2026-08-20）────────────────────────────────
        //
        // Roam 是广播给陌生人的，按苹果 1.2 的口径它是 "posted" —— 必须事先审。
        // 放在这里是因为：**这一步必须挡在 AI 工作之前**。往下就要跑 embedding
        // 和 vision，不能让不该发布的内容先被送去做推理。
        //
        // 这段不碰任何 prompt / 模型 / 推理逻辑，它只是一道闸门。
        //
        // 调用方式是服务端到服务端（带 service key），所以要把**真实用户和
        // 真实 IP** 转述过去，否则 safety_events 记下的会是边缘节点的 IP。
        //
        // 失败一律放行：我们什么都没学到，就没有知情，也就没有义务
        // （18 U.S.C. §2258A(f)）。宁可漏一条，不要让 OpenAI 抖一下就发不了帖。
        try {
          const modResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/moderate-content`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              surface: "roam",
              text: content.trim(),
              image_path: typeof image_url === "string" && image_url && !/^https?:///i.test(image_url)
                ? image_url : null,
              bucket: "roam-media",
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
            // **不告诉他命中了哪一类** —— 说了就是在教他怎么改到刚好绕过去。
            return new Response(JSON.stringify({
              error: "This doesn’t fit our Community Guidelines. Please edit it and try again.",
            }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch (e) {
          console.error("moderation unavailable, publishing unchecked:", String(e));
        }

        const duration = (duration_hours === 24) ? 24 : 6;
        let textToEmbed = content.trim();

        // travel_posts.image_url 从 2026-08-18（迁移 96）起存的是 **roam-media 桶里的
        // 路径**，不再是用户粘贴的外链 —— 外链既审不了（审过之后可以换掉内容），
        // 也会把每个浏览者的 IP 送给发帖人控制的服务器。
        //
        // 原来这里的判据是 `startsWith("http")`，所以改自托管之后这一整段**静默跳过**了，
        // 带图的 Roam 退回纯文本 embedding。下面按两种形态分别处理：
        //   路径  → 签一个一小时的 URL 再给模型（私有桶，模型那边要能拉得到）
        //   http  → 迁移 96 之前的老数据，原样放行
        let visionUrl: string | null = null;
        if (image_url && typeof image_url === "string" && image_url.trim().length > 0) {
          if (/^https?:\/\//i.test(image_url)) {
            visionUrl = image_url;
          } else {
            const { data: signed, error: signErr } = await ctx.supabaseAdmin
              .storage
              .from("roam-media")
              .createSignedUrl(image_url, 3600);
            if (signErr || !signed?.signedUrl) {
              // 留日志：签名失败和"这条帖子没图"必须分得开，
              // 否则又是一个只能靠猜的静默降级。
              console.error("Roam image sign failed:", signErr?.message ?? "no signed url", image_url);
            } else {
              visionUrl = signed.signedUrl;
            }
          }
        }

        // If an image is attached, call GPT-5.6-Luna Vision to extract multimodal image features
        if (visionUrl) {
          try {
            const visionResp = await openai.chat.completions.create({
              model: "gpt-5.6-luna",
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: "Describe the key visual elements, mood, and objects in 2 short sentences." },
                    { type: "image_url", image_url: { url: visionUrl } }
                  ]
                }
              ],
              // gpt-5.6-luna 只认 max_completion_tokens，而且这个预算包含推理 token；
              // 照抄 60 会拿到空描述，图片等于白审。
              max_completion_tokens: 300,
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
