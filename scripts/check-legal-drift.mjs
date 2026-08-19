/**
 * 比对 App 里内置的文书版本号和 zzup.org 线上页面的版本号。
 *
 *   node scripts/check-legal-drift.mjs
 *
 * 为什么需要它：文书正本在网站仓库，App 里是生成出来的副本，两个仓库分开提交，
 * 没有任何机制**强制**改完文书后回来跑 sync-legal。这个脚本就是那个提醒。
 *
 * 不一致不代表数据是错的 —— 用户同意的确实是他当时看到的那一版，记录是诚实的。
 * 但它意味着 App 里挂着旧文案，该跑一次 `node scripts/sync-legal.mjs` 然后发版。
 *
 * 退出码：0 = 一致，1 = 有漂移或拉不到页面（可以直接接进构建前的检查）。
 */
import { DOC_VERSIONS } from '../lib/legal/documents.generated.ts';

const PAGES = {
  terms: 'https://zzup.org/terms',
  guidelines: 'https://zzup.org/guidelines',
  privacy: 'https://zzup.org/privacy',
};

let bad = 0;

for (const [key, url] of Object.entries(PAGES)) {
  const local = DOC_VERSIONS[key];
  let live = null;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    // 只抓那一行 meta，不解析正文 —— 用正则啃 HTML 结构是会出错的
    const m = html.match(/VERSION\s+([0-9]+\.[0-9]+)\s*·\s*LAST UPDATED\s+([^<]+)/i);
    if (!m) throw new Error('页面里找不到版本行');
    live = { version: m[1], updated: m[2].trim() };
  } catch (e) {
    console.log(`✗ ${key.padEnd(11)} 拉不到线上版本：${e.message}`);
    bad++;
    continue;
  }

  if (live.version === local) {
    console.log(`✓ ${key.padEnd(11)} v${local}  （线上 ${live.updated}）`);
  } else {
    console.log(`✗ ${key.padEnd(11)} App 内置 v${local}，线上是 v${live.version}（${live.updated}）`);
    bad++;
  }
}

if (bad) {
  console.log('\n有漂移。跑 `node scripts/sync-legal.mjs` 重新生成，然后重新构建 App。');
  process.exit(1);
}
console.log('\n一致。');
