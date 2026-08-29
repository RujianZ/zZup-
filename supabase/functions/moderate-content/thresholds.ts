/**
 * thresholds.ts — Content Moderation Thresholds & Decision Logic
 *
 * Single Source of Truth for both:
 * 1. Production Supabase Edge Function (`moderate-content/index.ts`)
 * 2. Local Adversarial Evaluation Framework (`scripts/moderation-eval/run.mjs`)
 */

/** Category that triggers formal legal audit logging (safety_events) & Discord alerts */
export const RECORDED_CATEGORY = "sexual/minors";

/**
 * 留证阈值 —— **和拦截阈值是两个数，故意的。**
 *
 * `THRESHOLDS["sexual/minors"] = 0.01` 是**拦截**线：定得低，错了的代价只是
 * 「这条发不出去」，用户当场就知道，不留痕不处罚。
 *
 * 这个 0.05 是**留证**线：命中它才写 `safety_events` + 呼 Discord。
 * `safety_events` 是法律留证表（表注释：预期永远接近 0 行），进了它就要人工认定，
 * 认定结果可能是封号。所以它的门槛必须高于拦截线 —— 不然一条追剧贴就能
 * 在证据表里生成一行「疑似未成年人性内容」并把人从床上叫起来。
 *
 * 定 0.05 的依据（2026-08-29，用 scripts/moderation-eval 那 88 条的缓存分数复核）：
 *
 *   0.0315  "Anyone watching Euphoria season 2? The high school drama is crazy."
 *   ──────  0.05  ← 这条线
 *   0.0573  "I like girls who look super young and innocent, dm if you look like a teen"
 *
 * 35 条正常样本里，第二高的只有 0.000582 —— 也就是说唯一够得着这条线的正常文本
 * 就是「聊高中题材影视剧」这一类。校园 App 里 high school 是高频词，所以留了
 * 1.6 倍余量把它挡在证据表外面；再往上抬（0.10 / 0.20）会让 8–9 条真的招揽
 * 也一起进不了证据表 —— 拦得住，但没证据、没人工认定、封不了号。
 *
 * ⚠️ 这 1.6 倍余量是**薄的**，而且样本里这类正常文本只有 1 条（本机没有
 * OPENAI_API_KEY，补不了测）。上线后如果 Discord 开始被追剧/校园日常贴刷，
 * 先往上调这个数，**不要动拦截线**。
 */
export const RECORD_THRESHOLD = 0.05;

/**
 * Per-category cutoff thresholds for OpenAI omni-moderation-latest scores (0.0 to 1.0).
 * Content with score >= threshold is classified as BLOCKED.
 *
 * Optimized based on empirical evaluation benchmark on 2026-08-29.
 */
export const THRESHOLDS: Record<string, number> = {
  // P0 Legal Critical: Tightened from 0.20 to 0.01 to catch subtle grooming and grade/guardian evasions
  "sexual/minors": 0.01,

  // General sexual / prostitution / solicitation: Tightened from 0.70 to 0.35
  "sexual": 0.35,

  // Harassment & Direct personal threats: Tightened from 0.50 to 0.25
  "harassment/threatening": 0.25,
  "harassment": 0.60,

  // Hate speech & Threatening hate: Tightened from 0.50 to 0.40
  "hate/threatening": 0.40,
  "hate": 0.60,

  // Illicit goods, drug dealing, fake IDs, weapons: Tightened from 0.80 to 0.15
  "illicit/violent": 0.30,
  "illicit": 0.15,

  // Graphic violence: Tightened from 0.80 to 0.60
  "violence/graphic": 0.60,

  // Instructions/Encouragement for self-harm (Zero Tolerance): Tightened from 0.50 to 0.30
  "self-harm/instructions": 0.30,

  // Note: self-harm & self-harm/intent intentionally omitted (= allowed) to provide 988 support instead of blocking

  // General violence (high threshold to avoid false-flagging historical/sports discussion)
  "violence": 0.85,
};

/**
 * Judges whether a given set of moderation scores should trigger a block.
 *
 * @param scores Category scores dictionary returned by OpenAI Moderation API
 * @param thresholds Custom or override threshold table (defaults to production THRESHOLDS)
 * @returns The category name that triggered the block, or null if allowed
 */
export function judge(
  scores: Record<string, number>,
  thresholds: Record<string, number> = THRESHOLDS
): string | null {
  // 1. sexual/minors takes highest priority for audit logging & legal retention
  const minorLimit = thresholds[RECORDED_CATEGORY] ?? THRESHOLDS[RECORDED_CATEGORY];
  if ((scores[RECORDED_CATEGORY] ?? 0) >= minorLimit) {
    return RECORDED_CATEGORY;
  }

  // 2. Evaluate all other categories
  for (const [cat, limit] of Object.entries(thresholds)) {
    if (cat === RECORDED_CATEGORY) continue;
    if ((scores[cat] ?? 0) >= limit) {
      return cat;
    }
  }

  return null;
}
