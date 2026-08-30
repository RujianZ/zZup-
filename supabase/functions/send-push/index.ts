// send-push — 私聊 DM 的推送通知
//
// 由 messages 的 AFTER INSERT 触发器 notify_dm_push() 调用（迁移 119）。
// 触发器只传一个 message_id，剩下的判断全在这里做。
//
// ─── 推送里放什么，不放什么（Joe 2026-08-29 拍板）─────────────────────────
//
//   标题  发件人显示名，例如  wangqi
//   正文  Sent you a message / a photo / a voice message / a file
//   data  conversation_id —— 点通知直接跳进那个会话
//
// **消息内容一个字都不放。**
//
// 理由：推送载荷会经过 Expo → Apple/Google，在他们那里不是端到端加密的。
// 显示发件人是所有 IM 的标准做法、用户确实需要；但正文出去就等于把私聊内容
// 交给三家外部服务商，那跟 moderate-content 顶部那条
// 「私聊和群聊的文字、图片、语音一律不经过这里」的立场直接冲突。
//
// ⚠️ 就算这样，Expo / Google / Apple 依然会知道「谁在什么时候给谁发了消息」
// 这层元数据 —— 这是推送机制本身决定的，任何有推送的 App 都一样（含 Instagram）。
// **这条必须在隐私政策里说清楚**，不能写成「我们什么都不给任何人」。
//
// ─── 三条原则 ──────────────────────────────────────────────────────────
// 1. **推送失败绝不能影响发消息。** 触发器那侧包了 exception handler，
//    这侧任何错误也只记日志、回 200。发不出去是遗憾，发不出消息是事故。
// 2. **令牌失效就地删掉。** Expo 回 DeviceNotRegistered 说明这个令牌死了
//    （用户卸载/重装/系统回收）。留着只会每次都失败，还拖慢后面的推送。
// 3. **静音和开关在这里判，不在客户端判。** 客户端判等于没判。

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

type Attachment = { kind?: string };

/** 只描述"是什么类型的消息"，绝不描述内容 */
function bodyFor(msg: {
  image_url: string | null;
  attachments: unknown;
}): string {
  const atts: Attachment[] = Array.isArray(msg.attachments) ? msg.attachments : [];
  if (atts.some((a) => a?.kind === "audio")) return "Sent you a voice message";
  if (msg.image_url || atts.some((a) => a?.kind === "image")) return "Sent you a photo";
  if (atts.some((a) => a?.kind === "file")) return "Sent you a file";
  return "Sent you a message";
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── 鉴权：跟 ops-notify 同一套 ────────────────────────────────────────
  // 网关的 verify_jwt 已经挡了一层（要 Authorization），但那把是 publishable
  // key，客户端也有。所以再用 x-ops-key 认一次 —— 这个只有数据库读得到。
  const presented = req.headers.get("x-ops-key") ?? "";
  const { data: authorized, error: authErr } = await admin.rpc("verify_ops_key", {
    p_key: presented,
  });
  if (authErr) {
    console.error("verify_ops_key failed:", authErr.message);
    return json({ error: "auth check failed" }, 500);
  }
  if (authorized !== true) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* 下面的校验会拦 */ }

  const messageId = typeof body.message_id === "string" ? body.message_id : null;
  if (!messageId) return json({ error: "message_id required" }, 400);

  // ── 消息本体 ──────────────────────────────────────────────────────────
  const { data: msg, error: msgErr } = await admin
    .from("messages")
    .select("id, conversation_id, sender_id, image_url, attachments")
    .eq("id", messageId)
    .maybeSingle();

  if (msgErr) {
    console.error("load message failed:", msgErr.message);
    return json({ ok: false, reason: "load_failed" });
  }
  if (!msg || !msg.sender_id) return json({ ok: true, skipped: "no_message_or_sender" });

  // ── 复核会话类型 ──────────────────────────────────────────────────────
  // 触发器已经判过一次，这里再判一次：这个函数是能被单独调的，
  // 不能假设调用方一定做过过滤。
  const { data: conv } = await admin
    .from("conversations")
    .select("kind, is_agent_chat")
    .eq("id", msg.conversation_id)
    .maybeSingle();

  if (!conv || conv.kind !== "dm" || conv.is_agent_chat === true) {
    return json({ ok: true, skipped: "not_a_dm" });
  }

  // ── 发件人显示名 ──────────────────────────────────────────────────────
  const { data: sender } = await admin
    .from("profiles")
    .select("real_name, zzup_id")
    .eq("id", msg.sender_id)
    .maybeSingle();

  // real_name 可能为空（没走完注册），退回 zzup_id，再不行给个中性词。
  // 绝不在这里泄露邮箱之类的东西。
  const senderName = sender?.real_name?.trim()
    || (sender?.zzup_id ? `#${sender.zzup_id}` : "Someone");

  // ── 谁该收 ────────────────────────────────────────────────────────────
  // 会话成员里除发件人以外的人，且没把这个会话静音。
  const { data: members } = await admin
    .from("conversation_members")
    .select("account_id, muted_at")
    .eq("conversation_id", msg.conversation_id)
    .neq("account_id", msg.sender_id);

  const candidates = (members ?? [])
    .filter((m) => m.muted_at === null)
    .map((m) => m.account_id as string);

  if (candidates.length === 0) return json({ ok: true, skipped: "no_recipients" });

  // 开关关了的、软删的、非正常状态的，都不推
  const { data: profs } = await admin
    .from("profiles")
    .select("id, notify_dm, account_status, deleted_at")
    .in("id", candidates);

  const eligible = (profs ?? [])
    .filter((p) => p.notify_dm === true && p.account_status === "active" && p.deleted_at === null)
    .map((p) => p.id as string);

  if (eligible.length === 0) return json({ ok: true, skipped: "no_eligible" });

  // ── 令牌 ──────────────────────────────────────────────────────────────
  const { data: tokens } = await admin
    .from("push_tokens")
    .select("token")
    .in("account_id", eligible);

  const list = (tokens ?? []).map((t) => t.token as string);
  if (list.length === 0) return json({ ok: true, skipped: "no_tokens" });

  // ── 发给 Expo ─────────────────────────────────────────────────────────
  const messages = list.map((to) => ({
    to,
    title: senderName,
    body: bodyFor(msg),
    sound: "default",
    // 点通知要跳进对应会话。
    // sender_name 是**标题里已经有的那个名字**，不是新增暴露 ——
    // 放进来是因为 ChatScreen 需要 groupName，而私聊的会话名就是对方的名字。
    // 不放的话点通知只能进首页，或者要多一次网络请求才能跳对。
    // 除此之外只有 id，消息内容一个字都没有。
    data: { conversation_id: msg.conversation_id, sender_name: senderName },
    channelId: "dm",
    // **必须 high。** FCM 的默认优先级在设备打盹（Doze）时会被无限期推迟，
    // 对聊天消息来说等于没有 —— 用户第二天才看到「你有一条新消息」毫无意义。
    // high 优先级允许 FCM 立刻唤醒设备投递，这正是 IM 类通知的正当用途。
    priority: "high",
  }));

  let receipts: Array<{ status?: string; details?: { error?: string } }> = [];
  try {
    const resp = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    });
    if (!resp.ok) {
      console.error("expo push http", resp.status, (await resp.text()).slice(0, 300));
      return json({ ok: false, reason: "expo_http_error" });
    }
    const out = await resp.json();
    receipts = Array.isArray(out?.data) ? out.data : [];
  } catch (e) {
    // 原则 1：推送失败不算事故，记一笔就走
    console.error("expo push failed:", String(e));
    return json({ ok: false, reason: "expo_unreachable" });
  }

  // ── 原则 2：把死掉的令牌就地删掉 ──────────────────────────────────────
  const dead: string[] = [];
  receipts.forEach((r, i) => {
    if (r?.status === "error" && r?.details?.error === "DeviceNotRegistered") {
      dead.push(list[i]);
    }
  });
  if (dead.length > 0) {
    const { error: delErr } = await admin.from("push_tokens").delete().in("token", dead);
    if (delErr) console.error("prune dead tokens failed:", delErr.message);
  }

  const okCount = receipts.filter((r) => r?.status === "ok").length;
  console.log(JSON.stringify({
    event: "dm_push_sent",
    conversation: msg.conversation_id,
    attempted: list.length,
    ok: okCount,
    pruned: dead.length,
  }));

  return json({ ok: true, attempted: list.length, delivered: okCount, pruned: dead.length });
});
