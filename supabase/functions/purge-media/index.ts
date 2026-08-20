// purge-media — 把下架内容的文件搬进 quarantine 桶
//
// ─── 为什么需要这个函数 ─────────────────────────────────────────────────
//
// take_down_content（迁移 110）只换掉数据库里的内容，**文件还躺在原桶里**。
// 而存储策略是按文件夹判的：
//
//   chat-media：只要还是那个会话的成员，知道路径就能一直签出 URL ——
//               墓碑把 attachments 清空只是让客户端不知道路径了，
//               上传者自己当然知道。
//   roam-media：下架把 image_url 置空之后外人读不到了，
//               但**上传者本人仍然读得到**。
//
// 而 SQL **做不到**这件事：删 storage.objects 只删掉记录，真正的文件还在
// S3 里变成一个看不见、谁也删不掉、还一直计费的孤儿。只能走 storage API。
//
// ─── 为什么是「搬走」不是「删掉」───────────────────────────────────────
//
// 18 U.S.C. §2258A(h)：CSAM 材料上报后要**保存一年**，(h)(3) 还要求
// "maintained in a secure location and access to the material shall be
// limited"。**删掉等于毁灭我们有义务保存的证据。**
//
// quarantine 桶是 private 且**零策略** —— 只有 service_role 碰得到。
// 一次搬运同时满足两件事：用户够不到 · 我们留着。
//
// ─── 调用方式 ───────────────────────────────────────────────────────────
//
// 跟 ops-notify 一样用 x-ops-key 共享密钥（密钥在 Vault，触发器读它）。
// 不传参数就处理所有 media_quarantined_at is null 的行 —— 幂等，
// 重复跑不会出问题，所以可以放心重试。

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const QUARANTINE = "quarantine";

type MediaRef = { bucket: string; path: string };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* 空 body = 处理全部待搬的 */ }

  // ── 鉴权：跟 ops-notify 同一把钥匙 ────────────────────────────────────
  const presented = req.headers.get("x-ops-key") ?? "";
  const { data: authorized, error: authErr } = await admin.rpc("verify_ops_key", { p_key: presented });
  if (authErr) {
    console.error("verify_ops_key failed:", authErr.message);
    return json({ error: "auth check failed" }, 500);
  }
  if (authorized !== true) return json({ error: "Unauthorized" }, 401);

  // ── 挑出还没搬的 ──────────────────────────────────────────────────────
  let q = admin
    .from("content_takedowns")
    .select("id, kind, content_id, media_paths")
    .is("media_quarantined_at", null);

  if (typeof body.takedown_id === "string") q = q.eq("id", body.takedown_id);

  const { data: rows, error: qErr } = await q.limit(200);
  if (qErr) {
    console.error("query failed:", qErr.message);
    return json({ error: qErr.message }, 500);
  }
  if (!rows?.length) return json({ ok: true, processed: 0, moved: 0 });

  let moved = 0;
  let failed = 0;

  for (const row of rows) {
    const refs = (row.media_paths ?? []) as MediaRef[];

    // 没有文件的内容（纯文字的帖子、评论）也要标记 —— 否则每次都会被重新捞出来
    if (!refs.length) {
      await admin.from("content_takedowns")
        .update({ media_quarantined_at: new Date().toISOString() })
        .eq("id", row.id);
      continue;
    }

    const errors: string[] = [];

    for (const ref of refs) {
      if (!ref?.bucket || !ref?.path) continue;
      // quarantine 里按 takedown id 分文件夹：一条下架的所有文件在一起，
      // 上报 NCMEC 的时候按 id 就能找齐。
      const dest = `${row.id}/${ref.bucket}/${ref.path}`;

      // copy → 确认成功 → 才 remove。**顺序不能反** ——
      // 先删后拷失败的话，我们既毁了证据又没留下副本。
      const { error: copyErr } = await admin.storage
        .from(ref.bucket)
        .copy(ref.path, dest, { destinationBucket: QUARANTINE });

      if (copyErr) {
        // 文件本来就不在了（重复运行、或者用户自己删过）不算失败
        const msg = String(copyErr.message ?? copyErr);
        if (/not.*found|does not exist/i.test(msg)) continue;
        errors.push(`copy ${ref.bucket}/${ref.path}: ${msg}`);
        continue;
      }

      const { error: rmErr } = await admin.storage.from(ref.bucket).remove([ref.path]);
      if (rmErr) {
        errors.push(`remove ${ref.bucket}/${ref.path}: ${String(rmErr.message ?? rmErr)}`);
        continue;
      }
      moved++;
    }

    if (errors.length) {
      failed++;
      // **不标记完成** —— 下次还要再试。标记了就等于假装搬完了。
      await admin.from("content_takedowns")
        .update({ media_error: errors.join(" | ").slice(0, 1000) })
        .eq("id", row.id);
      console.error(`takedown ${row.id} partial failure:`, errors.join(" | "));
    } else {
      await admin.from("content_takedowns")
        .update({ media_quarantined_at: new Date().toISOString(), media_error: null })
        .eq("id", row.id);
    }
  }

  // 有失败就吼一声。文件没搬走 = 用户可能还够得到 = 这不是可以静默的事。
  if (failed > 0) {
    await admin.rpc("notify_ops", {
      p_event: "media_purge_failed",
      p_record: { failed_takedowns: failed, moved },
    }).catch(() => {});
  }

  return json({ ok: true, processed: rows.length, moved, failed });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { "Content-Type": "application/json" },
  });
}
