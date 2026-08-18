// contact-submit — 接收 zzup.org 上的联系/删号表单
//
// 三件事，顺序不能反：
//   1. 落库（contact_requests）—— 这是审计证据，先落库再通知
//   2. Discord webhook —— 我们立刻看到
//   3. Resend 发两封：给提交人的自动回执 + 给 admin@zzup.org 的通知
//
// **那封自动回执就是 CA AB 1394 的「36 小时内书面确认」**，发出后回写
// acknowledged_at。别把它当成可有可无的礼貌邮件。
//
// verify_jwt = false：这是公开表单，提交的人没有登录。防滥用靠三层：
//   蜜罐字段 + 同邮箱时间窗限流 + 长度上限。不上验证码 —— 第三方验证码脚本
//   会被网站自己的 CSP 挡死，而且对这个量级没必要。
//
// 只发信给 admin@zzup.org，用的是 Resend 的 Sending access 权限即可 ——
// 收件人不是权限维度，不需要 Full access。

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DISCORD_URL    = Deno.env.get("DISCORD_OPS_WEBHOOK") ?? "";
const RESEND_KEY     = Deno.env.get("RESEND_API_KEY") ?? "";

const FROM     = "zZuP! <noreply@mail.zzup.org>";
const REPLY_TO = "admin@zzup.org";
const OPS_TO   = "admin@zzup.org";

const ALLOWED_ORIGINS = [
  "https://zzup.org",
  "https://www.zzup.org",
  "http://localhost:4320",   // 本地预览用，上线前可以留着，它只是个 CORS 白名单
];

const CATEGORIES: Record<string, string> = {
  delete_account: "Delete my account",
  account:        "Account or sign-in problem",
  report:         "Report a user or content",
  partnership:    "Partnership",
  acquisition:    "Investment or acquisition",
  press:          "Press",
  other:          "Something else",
};

// 这两类要最显眼：删号有 30 天法定期限，举报涉及他人安全
const URGENT = ["delete_account", "report"];

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "content-type, apikey, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 邮件外壳 —— 跟 Supabase Auth 那两个模板同一套：无图片、有公司地址、有页脚。 */
function shell(title: string, inner: string) {
  return `<div style="margin:0;padding:24px;background:#F8FAF9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #E3E8E6;border-radius:14px;padding:32px;">
    <p style="margin:0 0 28px;font-size:20px;font-weight:800;color:#0F172A;letter-spacing:-0.4px;">zZuP<span style="color:#10B981;">!</span></p>
    <h1 style="margin:0 0 14px;font-size:19px;font-weight:700;color:#0F172A;">${title}</h1>
    ${inner}
    <hr style="border:none;border-top:1px solid #E3E8E6;margin:26px 0 18px;">
    <p style="margin:0;font-size:12px;line-height:1.6;color:#8A939B;">
      zZuP!, Inc., a Delaware corporation — one account, two selves.<br>
      251 Little Falls Drive, Wilmington, New Castle County, DE 19808<br>
      <a href="https://zzup.org/privacy" style="color:#10B981;">Privacy</a> ·
      <a href="https://zzup.org/terms" style="color:#10B981;">Terms</a>
    </p>
  </div>
</div>`;
}

async function sendMail(to: string, subject: string, html: string) {
  if (!RESEND_KEY) { console.warn("RESEND_API_KEY not set — skipping", subject); return false; }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, html }),
  });
  if (!r.ok) { console.error("Resend failed", r.status, await r.text()); return false; }
  return true;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST")   return json({ error: "Method not allowed" }, 405, origin);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400, origin); }

  // ── 蜜罐：真人看不到这个字段，填了的一定是脚本 ─────────────────────────
  // 故意返回 200 —— 让爬虫以为成功了，别去调整策略重试。
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return json({ ok: true }, 200, origin);
  }

  const category = String(body.category ?? "").trim();
  const email    = String(body.email ?? "").trim().toLowerCase();
  const message  = String(body.message ?? "").trim();
  const zzupId   = String(body.zzup_id ?? "").trim().slice(0, 12) || null;

  if (!CATEGORIES[category])                    return json({ error: "Pick a topic." }, 400, origin);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "That does not look like an email address." }, 400, origin);
  if (email.length > 254)                       return json({ error: "That email address is too long." }, 400, origin);
  if (message.length < 10)                      return json({ error: "Tell us a bit more — at least 10 characters." }, 400, origin);
  if (message.length > 4000)                    return json({ error: "That message is too long (4000 characters max)." }, 400, origin);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── 限流：同一邮箱 1 小时最多 3 条 ──────────────────────────────────────
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("contact_requests")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", since);

  if ((count ?? 0) >= 3) {
    return json({ error: "You have already sent us a few messages. Give us a little time to reply." }, 429, origin);
  }

  // ── 1. 落库（先落库再通知：证据优先） ──────────────────────────────────
  const { data: row, error: insErr } = await admin
    .from("contact_requests")
    .insert({ category, email, zzup_id: zzupId, message })
    .select("id, created_at")
    .single();

  if (insErr || !row) {
    console.error("insert failed", insErr?.message);
    return json({ error: "Could not save your message. Please try again." }, 500, origin);
  }

  const label  = CATEGORIES[category];
  const urgent = URGENT.includes(category);

  // ── 2. Discord ─────────────────────────────────────────────────────────
  //
  // ⚠️ 必须查 resp.ok。fetch 只在**网络层**失败时抛 —— webhook 返回
  // 401（密钥被换）/ 404（webhook 被删）/ 429（限流）全都是正常响应，
  // 不抛异常。只 catch 的话这些情况一条日志都不会留，函数照返 200，
  // 而我们会以为通知发出去了。后果是某天 webhook 失效，我们不知道自己在漏举报。
  // 同项目的 ops-notify 就是这么写的，照它来。
  //
  // Discord 失败**不阻断请求** —— 库已经落了，那才是审计证据；
  // 通知只是让我们更快看到。但失败必须留下痕迹。
  let discordOk = false;
  if (!DISCORD_URL) {
    console.error("DISCORD_OPS_WEBHOOK not configured — 表单通知不会送达", row.id);
  } else {
    try {
      const resp = await fetch(DISCORD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: urgent ? "@here 网站表单：有法定期限的请求" : undefined,
          embeds: [{
            title: urgent ? `📮 ${label}（有期限）` : `📮 ${label}`,
            color: urgent ? 0xf59e0b : 0x8b5cf6,
            fields: [
              { name: "邮箱", value: email, inline: true },
              { name: "zZuP ID", value: zzupId ? `#${zzupId}` : "未填", inline: true },
              { name: "内容", value: message.slice(0, 900) },
            ],
            footer: { text: `contact id: ${row.id}` },
            timestamp: new Date().toISOString(),
          }],
        }),
      });
      discordOk = resp.ok;
      if (!resp.ok) {
        console.error("Discord rejected:", resp.status, (await resp.text()).slice(0, 500), "contact id:", row.id);
      }
    } catch (e) {
      console.error("Discord unreachable:", String(e), "contact id:", row.id);
    }
  }

  // ── 3. 通知我们 ────────────────────────────────────────────────────────
  await sendMail(
    OPS_TO,
    `[${category}] ${email}`,
    shell(`New: ${esc(label)}`,
      `<p style="margin:0 0 8px;font-size:14px;color:#3F4A55;"><strong>From:</strong> ${esc(email)}</p>
       <p style="margin:0 0 8px;font-size:14px;color:#3F4A55;"><strong>zZuP ID:</strong> ${zzupId ? "#" + esc(zzupId) : "—"}</p>
       <p style="margin:0 0 8px;font-size:14px;color:#3F4A55;"><strong>Record:</strong> ${row.id}</p>
       <pre style="white-space:pre-wrap;word-break:break-word;background:#F8FAF9;border:1px solid #E3E8E6;border-radius:10px;padding:14px;font-size:14px;line-height:1.6;color:#0F172A;">${esc(message)}</pre>`),
  );

  // ── 4. 回执给提交人 —— AB 1394 的 36 小时凭证 ──────────────────────────
  const deadline = category === "delete_account"
    ? `<p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#3F4A55;">Account deletion requests are completed within <strong>30 days</strong>. We may write back first to confirm the request really comes from the account holder.</p>`
    : `<p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#3F4A55;">We review every message we receive and aim to reply within <strong>seven days</strong>.</p>`;

  const acked = await sendMail(
    email,
    "We got your message — zZuP!",
    shell("We got your message",
      `<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#3F4A55;">Thanks for writing in about <strong>${esc(label.toLowerCase())}</strong>. This is an automatic confirmation that your message reached us — a person has not read it yet.</p>
       ${deadline}
       <p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:#6B7680;">Your reference number is <strong style="color:#3F4A55;">${row.id}</strong>. Quote it if you write to us again.</p>
       <p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:#6B7680;"><strong style="color:#3F4A55;">We are not an emergency service.</strong> If someone is in immediate danger, contact your local emergency services first.</p>
       <p style="margin:0;font-size:13px;line-height:1.6;color:#6B7680;">What you sent us:</p>
       <pre style="white-space:pre-wrap;word-break:break-word;background:#F8FAF9;border:1px solid #E3E8E6;border-radius:10px;padding:14px;font-size:13px;line-height:1.6;color:#3F4A55;">${esc(message)}</pre>`),
  );

  if (acked) {
    await admin.from("contact_requests")
      .update({ acknowledged_at: new Date().toISOString() })
      .eq("id", row.id);
  }

  return json({ ok: true, id: row.id, acknowledged: acked, notified: discordOk }, 200, origin);
});
