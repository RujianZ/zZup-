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
