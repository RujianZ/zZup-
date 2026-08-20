/**
 * 把法律文书正本同步成 App 里可渲染的常量。
 *
 *   node scripts/sync-legal.mjs
 *
 * 正本是本仓库的 `docs/legal/*.md`。
 *
 * ── 正本为什么在这个仓库，而不在网站仓库 ──────────────────────────────
 *
 * 以前放在 `D:\zZuP! website\_source\`，但那个目录被 .gitignore 排除了 ——
 * Vercel 拿仓库根当站点根，提交进去就能从 zzup.org/_source/privacy.md
 * 直接读到 Markdown 原件。于是正本从来没进过任何一个仓库，只存在于
 * 一台机器的硬盘上。机器没了，正本就没了。
 *
 * 这个仓库不对外提供 HTTP 服务，放这里既进版本控制又不会被公网读到。
 *
 * ── ⚠️ 网站 HTML 不是从这里生成的 ────────────────────────────────────
 *
 * 网站是纯静态站，没有构建步骤，`privacy.html` / `terms.html` 是手写的。
 * 所以改文书要**改两处**：这里的 .md（喂 App）和网站的 .html（喂网页），
 * 内容必须一字不差。别只改一处就以为完事了。
 *
 * 为什么不在 App 里开外链看网页：见 docs/_local/上架总排查。简单说是
 * 跳浏览器不好看，而 PDF 在手机上是固定页宽、改一次还要重新导出。
 *
 * ⚠️ 没有任何东西**强制**你在改完文书后跑这个脚本。忘了跑的后果是
 *    App 里显示旧版本、并且把旧版本号写进 profiles —— 记录仍然是诚实的
 *    （用户确实同意的是他看到的那一版），只是滞后。
 *    `node scripts/check-legal-drift.mjs` 会拿线上页面的版本号跟这里比对。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'docs', 'legal');
const OUT = join(HERE, '..', 'lib', 'legal', 'documents.generated.ts');

// 社区规则的版本号只有网站 HTML 里有（见下），所以还是要摸一下网站仓库。
// 只读这一个文件，其余都不依赖它了。
const SITE = process.env.ZZUP_WEBSITE_DIR || 'D:/zZuP! website';

/** 抬头那行长这样：`VERSION 0.4 · LAST UPDATED AUG 17, 2026` */
function parseMeta(text, label) {
  const m = text.match(/VERSION\s+([0-9]+\.[0-9]+)\s*·\s*LAST UPDATED\s+([^\n<]+)/i);
  if (!m) throw new Error(`${label}: 找不到版本行，抬头格式变了？`);
  return { version: m[1].trim(), updated: m[2].trim().replace(/\s+/g, ' ') };
}

/** 去掉抬头（标题 + 版本行 + 第一条分隔线），正文从第一节开始 */
function stripHeader(md) {
  const lines = md.split(/\r?\n/);
  let i = 0;
  if (lines[i]?.startsWith('# ')) i++;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (/^VERSION\s/i.test(lines[i] ?? '')) i++;
  while (i < lines.length && (lines[i].trim() === '' || lines[i].trim() === '---')) i++;
  return lines.slice(i).join('\n').trim();
}

const termsMd = readFileSync(join(SRC, 'terms.md'), 'utf8');
const privacyMd = readFileSync(join(SRC, 'privacy.md'), 'utf8');
// 社区规则在网站上是独立一页、独立版本号，但正文就是条款的附录 A
// （2026-08-18 逐字比对过）。版本号只有 HTML 里有，从那儿取。
const guidelinesHtml = readFileSync(join(SITE, 'guidelines.html'), 'utf8');

const APPENDIX = '# Appendix A — Community Guidelines';
const idx = termsMd.indexOf(APPENDIX);
if (idx === -1) throw new Error('terms.md 里找不到附录 A 的标题，改名了？');
const guidelinesBody = termsMd.slice(idx + APPENDIX.length).trim();

const docs = {
  terms: {
    title: 'Terms of Service',
    ...parseMeta(termsMd, 'terms.md'),
    body: stripHeader(termsMd),
  },
  guidelines: {
    title: 'Community Guidelines',
    ...parseMeta(guidelinesHtml, 'guidelines.html'),
    body: guidelinesBody,
  },
  privacy: {
    title: 'Privacy Notice',
    ...parseMeta(privacyMd, 'privacy.md'),
    body: stripHeader(privacyMd),
  },
};

/** 正文进模板字符串，反引号和 ${ 必须转义，否则生成出来的 TS 编译不过 */
const lit = (s) => '`' + s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';

const out = `// 自动生成，不要手改 —— 跑 \`node scripts/sync-legal.mjs\` 重新生成。
// 正本：docs/legal/*.md
// ⚠️ 网站的 privacy.html / terms.html 是手写的，不是从正本生成的。改文书要改两处。
// 生成时间不写进来，否则每次跑都产生一个假 diff。

export type LegalDocKey = 'terms' | 'guidelines' | 'privacy';

export interface LegalDoc {
  key: LegalDocKey;
  title: string;
  version: string;
  updated: string;
  body: string;
}

export const LEGAL_DOCS: Record<LegalDocKey, LegalDoc> = {
${Object.entries(docs)
  .map(
    ([key, d]) => `  ${key}: {
    key: '${key}',
    title: ${JSON.stringify(d.title)},
    version: ${JSON.stringify(d.version)},
    updated: ${JSON.stringify(d.updated)},
    body: ${lit(d.body)},
  },`,
  )
  .join('\n')}
};

/** 写进 profiles 的三个版本号。改文书 → 重跑脚本 → 这里变 → 老用户被重新拦一次。 */
export const DOC_VERSIONS = {
  terms: LEGAL_DOCS.terms.version,
  guidelines: LEGAL_DOCS.guidelines.version,
  privacy: LEGAL_DOCS.privacy.version,
} as const;
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out, 'utf8');

console.log('已生成', OUT.replace(/\\/g, '/'));
for (const [k, d] of Object.entries(docs)) {
  console.log(`  ${k.padEnd(11)} v${d.version}  ${d.updated}  ${d.body.length} 字符`);
}
