// ops-notify — 把数据库事件转成 Discord 消息
//
// 为什么中间要有这一层：Discord 只认自己那套 JSON（embeds/color/fields），
// Supabase 数据库触发器的原始载荷它直接拒收。而且 Discord 的 webhook URL
// 存在 Edge Function 的 secret 里，不落数据库。
//
// verify_jwt = false：调用方是数据库触发器，它没有用户 JWT。
// 改用共享密钥鉴权 —— 密钥存在 Supabase Vault 里，触发器读它、本函数校验它，
// 全程不需要任何人手工传递。
//
// 校验走 public.verify_ops_key() RPC 而不是直接读 vault：
//   1. vault schema 不在 PostgREST 暴露列表里，直接查一定返回空；
//   2. 更重要的是 RPC 只回布尔值 —— 密钥永远不离开数据库，
//      Edge Function 即使日志泄露也拿不到密钥本身。
//
// 唯一不需要密钥的是 selftest，它只回布尔值，不泄露任何内容。
//
// ⚠️ 这个函数是**唯一**决定「什么数据离开我们自己的基础设施」的地方。
//    数据库推过来的是整行（举报那行里带着最近 50 条消息的快照），
//    Discord 只应该收到下面每个分支里逐字段挑出来的那几项。
//    所以：**任何新事件都必须写自己的分支**，兜底分支只发事件名和 id，
//    绝不倾倒原始载荷。

import { createClient } from "npm:@supabase/supabase-js@2";

const DISCORD_URL = Deno.env.get("DISCORD_OPS_WEBHOOK") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const COLORS: Record<string, number> = {
  critical: 0xef4444,
  report: 0xf59e0b,
  signup: 0x10b981,
  deletion: 0x6b7280,
  default: 0x8b5cf6,
};

// 这两类涉及人身安全/法律义务，必须最显眼
const CRITICAL_CATEGORIES = ["underage", "self_harm"];

// Discord 的硬限制。超一个字整条 webhook 被 400 拒收 —— 通知就这么丢了，
// 而且丢得静悄悄（pg_net 是异步的，数据库那边不会报错）。
const LIMIT_FIELD_VALUE = 1024;
const LIMIT_TITLE = 256;

/**
 * 把任意值压成一个**一定能被 Discord 接受**的 field value。
 *
 * 两件事都必须做：
 *   · 截断到 1024 —— 用户可控的文本（举报描述、名字）没有服务端长度约束
 *   · 空串兜底成 "—" —— Discord 不接受空字符串，`?? ` 挡不住 ''
 */
function field(v: unknown, max = LIMIT_FIELD_VALUE): string {
  const s = (v === null || v === undefined) ? "" : String(v);
  const trimmed = s.slice(0, max);
  return trimmed.length > 0 ? trimmed : "—";
}

function title(v: string): string {
  return v.slice(0, LIMIT_TITLE);
}

function buildEmbed(event: string, payload: Record<string, unknown>) {
  const row = (payload.record ?? {}) as Record<string, any>;

  if (event === "report") {
    const critical = CRITICAL_CATEGORIES.includes(row.category);
    const shots = Array.isArray(row.attachments) ? row.attachments.length : 0;
    // context.network 是服务端从 cf-connecting-ip 读的（迁移 105），客户端伪造不了。
    // context.client 是客户端自报的，**不要**拿它当证据。
    const net = (row.context?.network ?? {}) as Record<string, any>;
    const whereFrom = net.ip
      ? `${net.ip}${net.country ? ` · ${net.country}` : ""}`
      : "未记录";
    return {
      content: critical ? "@here 需要优先处理的举报" : undefined,
      // critical 那条是我们自己写死的字符串，@here 是有意的。
      // 其余一律禁止解析提及 —— 用户可控文本永远不该 ping 到人。
      allowed_mentions: critical ? { parse: ["everyone"] } : { parse: [] },
      embeds: [{
        title: title(critical ? `🚨 举报 · ${row.category}` : `⚠️ 新举报 · ${row.category}`),
        color: critical ? COLORS.critical : COLORS.report,
        fields: [
          { name: "举报人", value: field(row.reporter_zzup_id ? `#${row.reporter_zzup_id}` : null), inline: true },
          { name: "被举报", value: field(row.reported_zzup_id ? `#${row.reported_zzup_id}` : "未指定"), inline: true },
          { name: "截图", value: field(shots), inline: true },
          // 举报人的 IP。上报 NCMEC 时执法机关第一个要的就是它，
          // 而 Supabase 的 auth 日志免费版只留 1 天，等人工认定完就没了。
          { name: "举报来自", value: field(whereFrom), inline: true },
          { name: "UA", value: field(net.user_agent, 200), inline: true },
          { name: "描述", value: field(row.description, 900) },
        ],
        footer: { text: `report id: ${field(row.id, 200)}` },
        timestamp: new Date().toISOString(),
      }],
    };
  }

  // 内容审核命中 sexual/minors。**这是需要人在 72 小时内处理的那一类。**
  //
  // 只发 id / 表面 / 类别 / 谁 / 从哪来。
  // **绝不发图、绝不发签名 URL、绝不发文字原文** —— 原文在 safety_events
  // 那一行里，要看去数据库看，不要让它出现在一个聊天软件里。
  if (event === "safety_flag") {
    const net = (row.network ?? {}) as Record<string, any>;
    return {
      content: "@here 内容审核命中，需要人工认定",
      allowed_mentions: { parse: ["everyone"] },
      embeds: [{
        title: title("🚨 内容审核命中 · sexual/minors"),
        color: COLORS.critical,
        description: "内容**已被拦下**，没有发布。账号**未被自动处理** —— 等人工认定。认定属实：立即永久封 + 向 NCMEC 上报 + 材料保存一年。",
        fields: [
          { name: "表面", value: field(row.surface), inline: true },
          { name: "账号", value: field(row.actor_zzup_id ? `#${row.actor_zzup_id}` : null), inline: true },
          { name: "来自", value: field(net.ip ? `${net.ip}${net.country ? ` · ${net.country}` : ""}` : null), inline: true },
        ],
        footer: { text: `safety_events id: ${field(row.id, 200)}` },
        timestamp: new Date().toISOString(),
      }],
    };
  }

  // 处置执行完了。这条是**给我们自己留的账**，不是给用户的通知。
  if (event === "enforcement") {
    const banned = row.action === "ban";
    return {
      allowed_mentions: { parse: [] },
      embeds: [{
        title: title(banned ? "⛔ 永久封禁" : `⏸️ 禁言 ${row.days ?? "?"} 天`),
        color: banned ? COLORS.critical : COLORS.report,
        fields: [
          { name: "账号", value: field(row.target_zzup_id ? `#${row.target_zzup_id}` : null), inline: true },
          { name: "第几次", value: field(row.strike_number), inline: true },
          { name: "零容忍", value: field(row.zero_tolerance ? "是（不走阶梯）" : "否"), inline: true },
          { name: "理由", value: field(row.reason, 900) },
        ],
        timestamp: new Date().toISOString(),
      }],
    };
  }

  if (event === "signup") {
    return {
      allowed_mentions: { parse: [] },
      embeds: [{
        title: "🎉 新用户注册",
        color: COLORS.signup,
        fields: [
          { name: "zZuP ID", value: field(row.zzup_id ? `#${row.zzup_id}` : null), inline: true },
          { name: "名字", value: field(row.real_name || "（尚未完成引导）", 200), inline: true },
        ],
        timestamp: new Date().toISOString(),
      }],
    };
  }

  if (event === "deletion") {
    return {
      allowed_mentions: { parse: [] },
      embeds: [{
        title: "👋 账号已删除",
        color: COLORS.deletion,
        fields: [{ name: "zZuP ID", value: field(row.zzup_id ? `#${row.zzup_id}` : null), inline: true }],
        timestamp: new Date().toISOString(),
      }],
    };
  }

  // 兜底：**只说发生了什么，不说内容**。
  //
  // 这里原来是 JSON.stringify(payload).slice(0, 1500) —— 也就是把整行原始数据
  // 推给 Discord。三个已知事件都有分支所以从没触发过，但只要有人加了新事件
  // 忘了写分支，举报那种带 50 条私信快照的行就会整个漏出去。
  // 兜底分支的正确行为是「告诉我有个事件没被处理」，不是「把它打印出来」。
  return {
    allowed_mentions: { parse: [] },
    embeds: [{
      title: title(`⚙️ 未处理的事件: ${event}`),
      color: COLORS.default,
      description: "这个事件类型在 ops-notify 里没有对应分支，内容已被有意省略。去 ops-notify 补一个分支。",
      fields: [{ name: "record id", value: field((payload.record as any)?.id) , inline: true }],
      timestamp: new Date().toISOString(),
    }],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* 空 body 按 selftest 处理 */ }

  // ── 自检：只回布尔值，永不回传密钥内容 ────────────────────────────────
  if (body.action === "selftest" || Object.keys(body).length === 0) {
    return new Response(JSON.stringify({
      ok: true,
      discord_webhook_configured: DISCORD_URL.length > 0,
      discord_url_looks_valid: DISCORD_URL.startsWith("https://discord.com/api/webhooks/")
        || DISCORD_URL.startsWith("https://discordapp.com/api/webhooks/"),
    }), { headers: { "Content-Type": "application/json" } });
  }

  // ── 鉴权 ────────────────────────────────────────────────────────────────
  const presented = req.headers.get("x-ops-key") ?? "";
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: authorized, error: authErr } = await admin.rpc("verify_ops_key", { p_key: presented });

  if (authErr) {
    console.error("verify_ops_key failed:", authErr.message);
    return new Response(JSON.stringify({ error: "auth check failed" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  if (authorized !== true) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  if (!DISCORD_URL) {
    return new Response(JSON.stringify({ error: "DISCORD_OPS_WEBHOOK not configured" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  const payload = buildEmbed(String(body.event ?? "unknown"), body);

  // 超时兜底：Discord 卡住的话函数会一直挂着，pg_net 那边也只是超时，
  // 结果是「既没发出去，也没人知道没发出去」。
  // 429 必须重试。**这不是理论问题** —— 一次连发 7 条测试通知，
  // 第 6 条就被 Discord 限流拒了（webhook 大约每 2 秒 5 条）。
  // 举报是封号的唯一来源，两个人同时举报同一个人就够触发，
  // 丢掉的那条不会有第二次机会。
  //
  // Discord 在 429 的响应体里给 retry_after（秒），照着睡就行，不用自己猜退避。
  const MAX_ATTEMPTS = 4;
  let resp: Response | null = null;
  let lastDetail = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10_000);
    try {
      resp = await fetch(DISCORD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ac.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      lastDetail = String(e);
      console.error(`Discord unreachable (attempt ${attempt}):`, lastDetail);
      if (attempt === MAX_ATTEMPTS) break;
      await new Promise((r) => setTimeout(r, 500 * attempt));
      continue;
    }
    clearTimeout(timer);

    if (resp.ok) {
      return new Response(JSON.stringify({ ok: true, attempts: attempt }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    lastDetail = await resp.text();

    if (resp.status === 429 && attempt < MAX_ATTEMPTS) {
      let waitMs = 1000;
      try {
        const after = JSON.parse(lastDetail)?.retry_after;
        if (typeof after === "number") waitMs = Math.ceil(after * 1000) + 250; // 加点余量，别踩着点重发
      } catch { /* 解析不出来就用默认 1 秒 */ }
      console.warn(`Discord 429, retrying in ${waitMs}ms (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    // 4xx（超长 / 空值 / 字段名写错）重试多少次都是同样的结果，直接放弃。
    break;
  }

  // 一定要把 Discord 的原话记下来 —— 400 的原因只在这段响应体里，
  // 没有它就只能靠猜。
  console.error("Discord rejected:", resp?.status ?? "network", lastDetail);
  return new Response(JSON.stringify({
    error: `Discord ${resp?.status ?? "unreachable"}`,
    detail: lastDetail.slice(0, 500),
  }), { status: 502, headers: { "Content-Type": "application/json" } });

});
