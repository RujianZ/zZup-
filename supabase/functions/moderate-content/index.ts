// moderate-content — 发布前内容审核
//
// 这是**运维管道，不是 AI 编排** —— 它不做推理、没有 prompt、不选模型行为。
// 它把一段文字或一张图交给 OpenAI 的 moderation 接口，拿回 13 个类别的分数，
// 按我们自己定的阈值给一个「放/拦」的答案。所以它归我们，不归 Ethan。
//
// ─── 只在这几个表面调用 ───────────────────────────────────────────────
//   profile     真名 / 简介 / 宠物名 / 宠物简介（陌生人看得见 = 苹果口径的 posted）
//   roam        发帖的文字和图片（事先审，过了才可见）
//   pulse       那一句意向（同步，决定我们把你推给谁）
//   pet_image   发给自己宠物的图（我们会主动把它发给 OpenAI 做 vision，
//               所以我们是传输方，不只是托管方）
//
// **私聊和群聊的文字、图片、语音一律不经过这里。** 不是漏了，是定死的：
// §2258A(f) 明文不要求主动监控，不看 = 不知情 = 无义务；而一旦开始看，
// 就开始承担知情带来的义务。语音另有一层 —— OpenAI moderation 不吃音频，
// 想审也没有工具，除非先转写，而转写落库正是我们否掉的那种监视。
//
// ─── 三条铁律 ─────────────────────────────────────────────────────────
// 1. **绝不使用 OpenAI 返回的 flagged 布尔值。** 实测它把一段战争题材课文标成
//    true。flagged 原值只在留证时存档，不参与任何判定。
// 2. **绝不把分数返回给客户端。** 返回分数等于把阈值送给想绕过的人。
//    只回 allowed / category。
// 3. **调用失败一律放行。** 我们什么都没学到，就没有知情，也就没有义务。
//    只记一笔「这次检查失败了」（不记内容），供运维观察失败率。

import { createClient } from "npm:@supabase/supabase-js@2";

const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MODEL = "omni-moderation-latest";

/**
 * 每个类别自己的阈值。**不要用一个统一阈值** —— 各类别的分数分布差异极大。
 *
 * 实测依据（2026-08-17 跑的，不要凭感觉推翻）：
 *   一段战争题材课文  violence 0.403 · harassment/threatening 0.0063 · flagged=true
 *   针对具体人的威胁  violence 0.921 · harassment/threatening 0.735
 *
 * 所以：判断「这是不是威胁」只看 harassment/threatening（差 117 倍），
 * violence 单独用会在上线第一天就开始误伤课业讨论 —— 它的阈值定得极高，
 * 基本只在血腥描写那种极端值才生效。
 */
const THRESHOLDS: Record<string, number> = {
  // ⚠️ 这一条阈值**故意定得低**。漏掉的代价是不可接受的，
  //    而命中的代价只是「拦下来 + 人叫过来看一眼」，不是自动封号。
  "sexual/minors": 0.20,

  "sexual": 0.70,
  "harassment/threatening": 0.50,
  "harassment": 0.80,
  "hate/threatening": 0.50,
  "hate": 0.80,
  "illicit/violent": 0.50,
  "illicit": 0.80,
  "violence/graphic": 0.80,

  // 「鼓励/教唆自伤」是 Guidelines 的零容忍条款之一，拦。
  "self-harm/instructions": 0.50,

  // ⚠️ self-harm 和 self-harm/intent **有意不设阈值 = 不拦**。
  //    那是一个人在说自己难受，不是违规。拦掉他的帖子跟 safety.html 上
  //    写的东西背道而驰。危机场景由宠物温暖地回应（Ethan 的 prompt 规则 7）。

  // violence 单独几乎没有判别力，只在极端值才当回事
  "violence": 0.92,
};

/**
 * ⚠️ 2026-08-20 实测得到的一条硬结论，别再试图推翻：
 *
 * **在 profile 这种短文本上，sexual 分数没有判别力。** 实测：
 *
 *     "sexy little baddie 💅 taken tho"（正当网络用语）   sexual = 0.5634
 *     "Sex and the City"（剧名）                          sexual = 0.2084
 *     "pay for sex tonight, cash ready"（招妓）            sexual = 0.3732
 *     "DaddysLittleSlut69"（性暗示用户名）                sexual = 0.2851
 *     "pay me for nudes, cashapp in bio"（卖裸照）        sexual = 0.2417
 *
 * 正当内容的最高分**高于所有该拦内容**。任何能拦住卖裸照的阈值都会拦掉
 * 正常用户的自我调侃。所以不要为了抓"用户名不体面"去调低 sexual ——
 * 而且我们的 Guidelines 本来就没禁止粗俗用户名，为它发明规则等于
 * 执行一条从未公开过的规则。真的过分了会有人举报。
 *
 * **sexual/minors 完全不同，信噪比是干净的**（同一轮实测）：
 *     正当提到年龄/小孩（18岁新生、小学助教、周末带小孩） 0.0000–0.0004
 *     五条未成年相关（含"anyone into younger girls"这种
 *     没写年龄的隐晦招揽）                                  全部拦下
 * 0.20 这个阈值有极大余量。
 */

// 命中这一类要留证 + 通知 + 人工认定；其余拦了不留痕
const RECORDED_CATEGORY = "sexual/minors";

type Verdict = {
  allowed: boolean;
  category?: string;
  /** unavailable = 检查没跑成，按放行处理 */
  reason?: "blocked" | "unavailable";
};

async function moderate(input: unknown[]): Promise<{ scores: Record<string, number>; flagged: boolean } | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8_000);
  try {
    const resp = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, input }),
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      console.error("moderation http", resp.status, (await resp.text()).slice(0, 300));
      return null;
    }
    const json = await resp.json();
    const r = json?.results?.[0];
    if (!r) return null;
    return { scores: r.category_scores ?? {}, flagged: r.flagged === true };
  } catch (e) {
    clearTimeout(timer);
    console.error("moderation failed:", String(e));
    return null;
  }
}

/** 按我们自己的阈值判定。返回命中的类别名，没命中返回 null。 */
function judge(scores: Record<string, number>): string | null {
  // sexual/minors 优先判 —— 它同时命中别的类别时，我们要记的是这一个
  if ((scores[RECORDED_CATEGORY] ?? 0) >= THRESHOLDS[RECORDED_CATEGORY]) {
    return RECORDED_CATEGORY;
  }
  for (const [cat, limit] of Object.entries(THRESHOLDS)) {
    if (cat === RECORDED_CATEGORY) continue;
    if ((scores[cat] ?? 0) >= limit) return cat;
  }
  return null;
}

function clientMeta(req: Request) {
  const h = req.headers;
  return {
    ip: h.get("cf-connecting-ip") ?? ((h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null),
    country: h.get("cf-ipcountry"),
    user_agent: (h.get("user-agent") ?? "").slice(0, 300),
    at: new Date().toISOString(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* 空 body 走下面的参数校验 */ }

  const surface = String(body.surface ?? "");
  const text: string | null = typeof body.text === "string" && body.text.trim() ? body.text : null;
  const imagePath: string | null = typeof body.image_path === "string" && body.image_path ? body.image_path : null;
  const bucket: string = typeof body.bucket === "string" && body.bucket ? body.bucket : "chat-media";

  if (!["profile", "roam", "pulse", "pet_image", "chat_image", "attachment"].includes(surface)) {
    return json({ error: "unknown surface" }, 400);
  }
  if (!text && !imagePath) return json({ error: "nothing to check" }, 400);

  // 调用者是谁 —— 留证要用，而且没有身份不给查。
  //
  // 两种调用方式：
  //   · 客户端直接调 → 用户 JWT，身份和 IP 都从这次请求本身取
  //   · 我们自己的 Edge Function 调（travel-mode / agent-chat / pet-chat）
  //     → service role key，身份和 IP 由调用方转述
  //
  // 第二种必须支持，否则 safety_events 里记下的会是 Supabase 边缘节点的 IP
  // 而不是发帖那个人的 —— 那条留证就白留了，执法机关拿到也没用。
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");

  let actorId: string | null = null;
  let meta: Record<string, unknown> = clientMeta(req);

  if (jwt && jwt === SERVICE_KEY) {
    // 只有拿得到 service key 的调用方才被信任转述这两项
    actorId = typeof body.actor_id === "string" ? body.actor_id : null;
    if (body.client_meta && typeof body.client_meta === "object") {
      meta = { ...meta, ...body.client_meta };
    }
    if (!actorId) return json({ error: "actor_id required for service calls" }, 400);
  } else {
    const { data: userData } = await admin.auth.getUser(jwt);
    actorId = userData?.user?.id ?? null;
    if (!actorId) return json({ error: "Unauthorized" }, 401);
  }
  const actor = { id: actorId };

  if (!OPENAI_KEY) {
    // 密钥没配 = 检查跑不了 = 放行（同 API 失败）。但这个要吼出来。
    console.error("OPENAI_API_KEY missing — content published unchecked");
    return json({ allowed: true, reason: "unavailable" } satisfies Verdict);
  }

  // 组装 moderation 的输入
  const input: unknown[] = [];
  if (text) input.push({ type: "text", text: text.slice(0, 4000) });

  let signedUrl: string | null = null;
  if (imagePath) {
    const { data: signed, error: signErr } = await admin.storage
      .from(bucket).createSignedUrl(imagePath, 300);
    if (signErr || !signed?.signedUrl) {
      // 签不出来就看不了图。放行，但记一笔 —— 这属于「检查失败」不属于「通过」。
      console.error("sign failed:", imagePath, signErr?.message);
      return json({ allowed: true, reason: "unavailable" } satisfies Verdict);
    }
    signedUrl = signed.signedUrl;
    input.push({ type: "image_url", image_url: { url: signedUrl } });
  }

  const result = await moderate(input);

  // ── 检查没跑成 → 放行（Joe 定）────────────────────────────────────────
  if (!result) {
    console.warn(JSON.stringify({
      event: "moderation_unavailable", surface,
      actor: actor.id, has_text: !!text, has_image: !!imagePath,
    }));
    return json({ allowed: true, reason: "unavailable" } satisfies Verdict);
  }

  const hit = judge(result.scores);
  if (!hit) return json({ allowed: true } satisfies Verdict);

  // ── 命中 sexual/minors → 留证 + 通知 + 等人工 ──────────────────────────
  if (hit === RECORDED_CATEGORY) {
    const { data: prof } = await admin
      .from("profiles").select("zzup_id").eq("id", actor.id).maybeSingle();

    const { data: ev, error: evErr } = await admin.from("safety_events").insert({
      actor_id: actor.id,
      actor_zzup_id: prof?.zzup_id ?? null,
      surface,
      category: hit,
      // flagged 原值一起存档，但它**不参与判定**，只是留个对照
      scores: { ...result.scores, _openai_flagged: result.flagged },
      text_excerpt: text ? text.slice(0, 2000) : null,
      storage_path: imagePath,
      network: meta,
    }).select("id").single();

    if (evErr) console.error("safety_events insert failed:", evErr.message);

    // Discord 只收 id 和类别 —— **绝不含图、绝不含签名 URL**
    // 走数据库的 notify_ops() 而不是直接 invoke ops-notify ——
    // 后者要 x-ops-key 头（密钥在 vault 里，只有数据库读得到），
    // 从 Edge Function 直接调会 401。
    const { error: nErr } = await admin.rpc("notify_ops", {
      p_event: "safety_flag",
      p_record: {
        id: ev?.id ?? null,
        surface,
        category: hit,
        actor_zzup_id: prof?.zzup_id ?? null,
        network: meta,
      },
    });
    if (nErr) console.error("notify failed:", nErr.message);

    return json({ allowed: false, reason: "blocked", category: hit } satisfies Verdict);
  }

  // ── 其余 12 类 → 拦了就完了：不留痕、不通知、不处罚 ────────────────────
  //
  // 只有 sexual/minors 会留证和通知。别的类别命中只意味着「这条发不出去」，
  // 用户当场就知道了，我们不需要也不应该为它建记录。
  return json({ allowed: false, reason: "blocked", category: hit } satisfies Verdict);
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { "Content-Type": "application/json" },
  });
}
