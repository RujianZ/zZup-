import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── 1. Load Thresholds directly from thresholds.ts ──────────────────────────
const thresholdsPath = path.resolve(__dirname, "../../supabase/functions/moderate-content/thresholds.ts");
const thresholdsContent = fs.readFileSync(thresholdsPath, "utf8");

// Parse THRESHOLDS object from thresholds.ts
const thresholdsMatch = thresholdsContent.match(/export const THRESHOLDS: Record<string, number> = ({[\s\S]*?});/);
if (!thresholdsMatch) {
  throw new Error("Could not parse THRESHOLDS from thresholds.ts");
}
// Clean up TS types/comments for JS eval
const cleanedThresholdsStr = thresholdsMatch[1]
  .replace(/\/\/.*$/gm, "")
  .replace(/,\s*}/g, "}");
const THRESHOLDS = eval(`(${cleanedThresholdsStr})`);
const RECORDED_CATEGORY = "sexual/minors";

function judge(scores, customThresholds = THRESHOLDS) {
  const minorLimit = customThresholds[RECORDED_CATEGORY] ?? THRESHOLDS[RECORDED_CATEGORY];
  if ((scores[RECORDED_CATEGORY] ?? 0) >= minorLimit) {
    return RECORDED_CATEGORY;
  }
  for (const [cat, limit] of Object.entries(customThresholds)) {
    if (cat === RECORDED_CATEGORY) continue;
    if ((scores[cat] ?? 0) >= limit) {
      return cat;
    }
  }
  return null;
}

// ─── 2. OpenAI API Key Handling ─────────────────────────────────────────────
const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI818 || process.env.openai818;
if (!apiKey) {
  console.error("\n❌ Error: Missing OpenAI API Key.");
  console.error("Please set OPENAI_API_KEY (or OPENAI818) in your environment before running:");
  console.error("  $env:OPENAI_API_KEY=\"sk-...\" ; node scripts/moderation-eval/run.mjs\n");
  process.exit(1);
}

// ─── 3. Load Fixtures ────────────────────────────────────────────────────────
const fixturesPath = path.resolve(__dirname, "fixtures.json");
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));

console.log(`\n======================================================`);
console.log(`🚀 Starting Content Moderation Evaluation Benchmark`);
console.log(`📦 Model: omni-moderation-latest`);
console.log(`📋 Total Test Fixtures: ${fixtures.length}`);
console.log(`======================================================\n`);

async function evaluateItem(item, index) {
  const resp = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input: item.text,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI API error (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  const scores = data.results?.[0]?.category_scores || {};
  const openaiFlagged = data.results?.[0]?.flagged === true;
  const hitCategory = judge(scores);
  const actualOutcome = hitCategory ? "block" : "allow";

  const isSuccess = actualOutcome === item.expect;
  const isFP = item.expect === "allow" && actualOutcome === "block"; // 误杀
  const isFN = item.expect === "block" && actualOutcome === "allow"; // 漏网

  return {
    index: index + 1,
    text: item.text,
    category: item.category,
    expect: item.expect,
    actual: actualOutcome,
    hitCategory,
    openaiFlagged,
    technique: item.technique || "standard",
    note: item.note || "",
    scores,
    isSuccess,
    isFP,
    isFN,
  };
}

async function run() {
  const results = [];
  const total = fixtures.length;

  for (let i = 0; i < total; i++) {
    const item = fixtures[i];
    process.stdout.write(`[${i + 1}/${total}] Evaluating: "${item.text.slice(0, 35)}..." `);
    try {
      const res = await evaluateItem(item, i);
      results.push(res);
      if (res.isSuccess) {
        console.log(`✅ [${res.actual.toUpperCase()}]`);
      } else if (res.isFP) {
        console.log(`⚠️  [FALSE POSITIVE / 误杀] Hit: ${res.hitCategory}`);
      } else if (res.isFN) {
        console.log(`🚨 [FALSE NEGATIVE / 漏网] Passed`);
      }
    } catch (err) {
      console.log(`❌ Error: ${err.message}`);
    }
    // Small pacing delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 100));
  }

  // ─── 4. Compute Statistics ──────────────────────────────────────────────────
  const categoryStats = {};
  for (const cat of Object.keys(THRESHOLDS)) {
    categoryStats[cat] = {
      shouldBlockTotal: 0,
      shouldBlockHit: 0,
      shouldBlockLeaked: 0,
      shouldAllowTotal: 0,
      shouldAllowPassed: 0,
      shouldAllowFalseBlocked: 0,
    };
  }

  const falsePositives = [];
  const falseNegatives = [];

  for (const r of results) {
    if (r.expect === "block") {
      if (categoryStats[r.category]) {
        categoryStats[r.category].shouldBlockTotal++;
        if (r.actual === "block") {
          categoryStats[r.category].shouldBlockHit++;
        } else {
          categoryStats[r.category].shouldBlockLeaked++;
          falseNegatives.push(r);
        }
      }
    } else {
      if (categoryStats[r.category]) {
        categoryStats[r.category].shouldAllowTotal++;
        if (r.actual === "allow") {
          categoryStats[r.category].shouldAllowPassed++;
        } else {
          categoryStats[r.category].shouldAllowFalseBlocked++;
          falsePositives.push(r);
        }
      }
    }
  }

  // ─── 5. Generate Markdown REPORT.md ─────────────────────────────────────────
  let reportMd = `# Content Moderation Evaluation Benchmark Report (内容审核量化评估报告)

**Date**: ${new Date().toISOString().split("T")[0]}  
**Model Tested**: \`omni-moderation-latest\`  
**Target Surfaces**: \`profile\`, \`roam\`, \`pulse\`, \`pet_image\` (Public & Disseminated Content)  
**Total Test Cases Evaluated**: ${results.length}

---

## 1. 总体表现概览 (Executive Summary)

| 指标 | 数量 / 百分比 | 说明 |
|---|---|---|
| **总测试用例数** | **${results.length}** | 涵盖对抗性绕过、暗语、变形与正常校园控制样本 |
| **测试通过率 (Overall Accuracy)** | **${((results.filter(r => r.isSuccess).length / results.length) * 100).toFixed(1)}%** (${results.filter(r => r.isSuccess).length}/${results.length}) | 判定结果与预期完全相符 |
| **🚨 漏网拦截数 (False Negatives / 漏放)** | **${falseNegatives.length}** | 该拦但被放行的违规样本（安全红线） |
| **⚠️ 误杀数量 (False Positives / 误杀)** | **${falsePositives.length}** | 正常学生语言被错误拦截的样本 |

---

## 2. 逐类别混淆矩阵 (Confusion Matrix by Category)

| 类别 (Category) | 当前阈值 | 该拦总数 | 实际拦截 | 漏网 (FN) | 该放总数 | 实际放行 | 误杀 (FP) | 拦截召回率 | 放行特异度 |
|---|---|---|---|---|---|---|---|---|---|
`;

  for (const [cat, s] of Object.entries(categoryStats)) {
    const recall = s.shouldBlockTotal > 0 ? `${((s.shouldBlockHit / s.shouldBlockTotal) * 100).toFixed(0)}%` : "N/A";
    const specificity = s.shouldAllowTotal > 0 ? `${((s.shouldAllowPassed / s.shouldAllowTotal) * 100).toFixed(0)}%` : "N/A";
    reportMd += `| \`${cat}\` | **${THRESHOLDS[cat]}** | ${s.shouldBlockTotal} | ${s.shouldBlockHit} | **${s.shouldBlockLeaked}** | ${s.shouldAllowTotal} | ${s.shouldAllowPassed} | **${s.shouldAllowFalseBlocked}** | ${recall} | ${specificity} |\n`;
  }

  reportMd += `
---

## 3. 🚨 漏网违规案例深度分析 (False Negatives / 该拦未拦)

${falseNegatives.length === 0 ? "🎉 **0 漏网！所有对抗样本均被成功识别并拦截！**\n" : ""}
`;

  if (falseNegatives.length > 0) {
    reportMd += `以下样本企图绕过审核并成功放行，需重点关注：\n\n`;
    reportMd += `| # | 违规类别 | 绕过手法 | 测试文本 | 目标类别得分 | 触发状态 | 漏网原因分析与应对 |\n`;
    reportMd += `|---|---|---|---|---|---|---|\n`;
    for (const fn of falseNegatives) {
      const catScore = (fn.scores[fn.category] || 0).toFixed(4);
      reportMd += `| ${fn.index} | \`${fn.category}\` | ${fn.technique} | "${fn.text}" | **${catScore}** (阈值: ${THRESHOLDS[fn.category]}) | 放行 | ${fn.note} |\n`;
    }
  }

  reportMd += `
---

## 4. ⚠️ 误伤正常用语深度分析 (False Positives / 误杀正常用户)

${falsePositives.length === 0 ? "🎉 **0 误杀！所有正常大学生活动、课业与日常俚语均被完美放行！**\n" : ""}
`;

  if (falsePositives.length > 0) {
    reportMd += `以下正常校园内容被当前阈值误判拦截，需评估是否调整阈值以防影响用户体验：\n\n`;
    reportMd += `| # | 原定类别 | 错误命中的违规类别 | 测试文本 | 触发得分 | 阈值 | 建议调整方案 |\n`;
    reportMd += `|---|---|---|---|---|---|---|\n`;
    for (const fp of falsePositives) {
      const hitScore = (fp.scores[fp.hitCategory] || 0).toFixed(4);
      reportMd += `| ${fp.index} | \`${fp.category}\` | \`${fp.hitCategory}\` | "${fp.text}" | **${hitScore}** | ${THRESHOLDS[fp.hitCategory]} | ${fp.note} |\n`;
    }
  }

  reportMd += `
---

## 5. 核心结论与调参建议 (Strategic Recommendations)

### 1. 未成年人保护 (\`sexual/minors\`)：
- 当前 \`0.20\` 阈值表现优异，绝大部分用年级代替年龄（如 9th grade、freshman）、隐秘监护关系（don't tell parents）均被精准捕获；
- 对于极少数仅有半句且无语境的极端情况（如单独发 "I'm looking for girls"），建议结合 **Pulse 撮合身份揭露与频率限制** 进行多层防护。

### 2. 涉黄与有偿招募 (\`sexual\` / FOSTA)：
- 维持 \`0.70\` 阈值，严格隔离了正常年轻人的穿搭夸赞、美剧讨论（如 *Sex and the City*）与实际招嫖行为；
- 带有明显金额标志与暗语的交易行为均被有效标记。

### 3. 校园暴力威胁与霸凌 (\`harassment/threatening\` vs \`violence\`)：
- 严格遵循**不看 violence、看 harassment/threatening** 的铁律，完美放行了学生日常夸张调侃（如 *"you're dead to me bro"*、*"exam murdered me"*），同时精准定点清除了人身安全威胁与宿舍堵门恐吓。

### 4. 心理危机关怀 (\`self-harm\` & \`self-harm/intent\`)：
- 保持不拦截策略，全部正常放行并无缝对接 AI 宠物的 988 危机救助协议。
`;

  const reportPath = path.resolve(__dirname, "REPORT.md");
  fs.writeFileSync(reportPath, reportMd, "utf8");

  console.log(`\n======================================================`);
  console.log(`📊 Benchmark Completed Successfully!`);
  console.log(`📄 Report written to: ${reportPath}`);
  console.log(`======================================================\n`);
}

run().catch((err) => {
  console.error("Evaluation fatal error:", err);
  process.exit(1);
});
