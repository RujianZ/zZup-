import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturesPath = path.resolve(__dirname, "fixtures.json");
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));
const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI818 || process.env.openai818;

async function runDetailedAnalysis() {
  const cachePath = path.resolve(__dirname, "scores_cache.json");
  let cachedScores = {};
  if (fs.existsSync(cachePath)) {
    cachedScores = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } else {
    console.log("Fetching scores for all fixtures from OpenAI...");
    for (let i = 0; i < fixtures.length; i++) {
      const item = fixtures[i];
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
      const data = await resp.json();
      cachedScores[item.text] = data.results?.[0]?.category_scores || {};
      await new Promise(r => setTimeout(r, 80));
    }
    fs.writeFileSync(cachePath, JSON.stringify(cachedScores, null, 2), "utf8");
  }

  // Simulation function
  function simulate(thresholds) {
    let fnCount = 0;
    let fpCount = 0;
    const fpList = [];
    const fnList = [];

    for (const item of fixtures) {
      const scores = cachedScores[item.text] || {};
      let blockedBy = null;
      
      // check sexual/minors first
      if ((scores["sexual/minors"] ?? 0) >= thresholds["sexual/minors"]) {
        blockedBy = "sexual/minors";
      } else {
        for (const [cat, limit] of Object.entries(thresholds)) {
          if (cat === "sexual/minors") continue;
          if ((scores[cat] ?? 0) >= limit) {
            blockedBy = cat;
            break;
          }
        }
      }

      const outcome = blockedBy ? "block" : "allow";
      if (item.expect === "block" && outcome === "allow") {
        fnCount++;
        fnList.push({ text: item.text, category: item.category, scores });
      }
      if (item.expect === "allow" && outcome === "block") {
        fpCount++;
        fpList.push({ text: item.text, blockedBy, score: scores[blockedBy] });
      }
    }
    return { fnCount, fpCount, fnList, fpList };
  }

  console.log("\n--- SIMULATION RESULTS ---");
  
  // Baseline (Production thresholds)
  const baseT = {
    "sexual/minors": 0.20,
    "sexual": 0.70,
    "harassment/threatening": 0.50,
    "harassment": 0.80,
    "hate/threatening": 0.50,
    "hate": 0.80,
    "illicit/violent": 0.50,
    "illicit": 0.80,
    "violence/graphic": 0.80,
    "self-harm/instructions": 0.50,
    "violence": 0.92,
  };
  const baseRes = simulate(baseT);
  console.log(`Current Production: Leaked (FN) = ${baseRes.fnCount}, False Blocked (FP) = ${baseRes.fpCount}`);

  // Test Option 1: Aggressive Tightening
  const opt1T = {
    "sexual/minors": 0.001,
    "sexual": 0.35,
    "harassment/threatening": 0.25,
    "harassment": 0.60,
    "hate/threatening": 0.40,
    "hate": 0.60,
    "illicit/violent": 0.30,
    "illicit": 0.15,
    "violence/graphic": 0.60,
    "self-harm/instructions": 0.30,
    "violence": 0.85,
  };
  const opt1Res = simulate(opt1T);
  console.log(`Option 1 (Aggressive): Leaked (FN) = ${opt1Res.fnCount}, False Blocked (FP) = ${opt1Res.fpCount}`);
  if (opt1Res.fpList.length > 0) {
    console.log("Option 1 False Positives:", JSON.stringify(opt1Res.fpList, null, 2));
  }
}

runDetailedAnalysis().catch(console.error);
