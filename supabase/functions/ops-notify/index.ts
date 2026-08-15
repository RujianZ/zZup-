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

function buildEmbed(event: string, payload: Record<string, unknown>) {
  const row = (payload.record ?? {}) as Record<string, any>;

  if (event === "report") {
    const critical = CRITICAL_CATEGORIES.includes(row.category);
    const shots = Array.isArray(row.attachments) ? row.attachments.length : 0;
    return {
      content: critical ? "@here 需要优先处理的举报" : undefined,
      embeds: [{
        title: critical ? `🚨 举报 · ${row.category}` : `⚠️ 新举报 · ${row.category}`,
        color: critical ? COLORS.critical : COLORS.report,
        fields: [
          { name: "举报人", value: `#${row.reporter_zzup_id ?? "?"}`, inline: true },
          { name: "被举报", value: row.reported_zzup_id ? `#${row.reported_zzup_id}` : "未指定", inline: true },
          { name: "截图", value: String(shots), inline: true },
          { name: "描述", value: String(row.description ?? "").slice(0, 900) || "—" },
        ],
        footer: { text: `report id: ${row.id ?? "?"}` },
        timestamp: new Date().toISOString(),
      }],
    };
  }

  if (event === "signup") {
    return {
      embeds: [{
        title: "🎉 新用户注册",
        color: COLORS.signup,
        fields: [
          { name: "zZuP ID", value: `#${row.zzup_id ?? "?"}`, inline: true },
          { name: "名字", value: row.real_name ?? "（尚未完成引导）", inline: true },
        ],
        timestamp: new Date().toISOString(),
      }],
    };
  }

  if (event === "deletion") {
    return {
      embeds: [{
        title: "👋 账号已删除",
        color: COLORS.deletion,
        fields: [{ name: "zZuP ID", value: `#${row.zzup_id ?? "?"}`, inline: true }],
        timestamp: new Date().toISOString(),
      }],
    };
  }

  return {
    embeds: [{
      title: `事件: ${event}`,
      color: COLORS.default,
      description: "```json\n" + JSON.stringify(payload).slice(0, 1500) + "\n```",
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
  const resp = await fetch(DISCORD_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error("Discord rejected:", resp.status, text);
    return new Response(JSON.stringify({ error: `Discord ${resp.status}` }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
