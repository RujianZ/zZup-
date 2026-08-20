/**
 * 量出每张宠物图里「真正画了东西」的那块矩形（alpha 边界），生成 assets/pets/artbox.generated.ts。
 *
 * 为什么要这张表：30 张图都是 417x600 的画布，但每张图里留白差得离谱 ——
 * dog_adult 占满 82% 的高，dog_child 只占 43%，mobius_child 只占 26%。
 * 直接 contain 的话，同一个画框里成年宠物顶天立地、幼年宠物缩成一小坨。
 * 靠手调 size 是调不出来的（试过，30 张要调 30 个数）。
 *
 * 重新生成：node scripts/measure-pet-art.mjs
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const DIR = 'assets/pets/png';
const OUT = 'assets/pets/artbox.generated.ts';

function bbox(file) {
  const b = fs.readFileSync(file);
  let i = 8, w = 0, h = 0, bd = 0, ct = 0;
  const idat = [];
  while (i < b.length) {
    const len = b.readUInt32BE(i);
    const type = b.toString('ascii', i + 4, i + 8);
    if (type === 'IHDR') { w = b.readUInt32BE(i + 8); h = b.readUInt32BE(i + 12); bd = b[i + 16]; ct = b[i + 17]; }
    if (type === 'IDAT') idat.push(b.subarray(i + 8, i + 8 + len));
    i += 12 + len;
  }
  if (ct !== 6 || bd !== 8) throw new Error(`${file}: 只支持 8bit RGBA，实际 ct=${ct} bd=${bd}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = w * bpp;
  let minX = w, maxX = -1, minY = h, maxY = -1, pos = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[pos++];
    const line = raw.subarray(pos, pos + stride); pos += stride;
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, bb = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      switch (ft) {
        case 1: v = (v + a) & 255; break;
        case 2: v = (v + bb) & 255; break;
        case 3: v = (v + ((a + bb) >> 1)) & 255; break;
        case 4: {
          const p = a + bb - c, pa = Math.abs(p - a), pb = Math.abs(p - bb), pc = Math.abs(p - c);
          v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? bb : c)) & 255; break;
        }
      }
      cur[x] = v;
    }
    prev = cur;
    // alpha > 16 才算「画了东西」—— 阴影边缘那圈几乎透明的像素不算进来
    for (let x = 0; x < w; x++) if (cur[x * 4 + 3] > 16) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return { w, h, x: minX / w, y: minY / h, cw: (maxX - minX + 1) / w, ch: (maxY - minY + 1) / h };
}

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.png')).sort();
const rows = files.map(f => {
  const key = path.basename(f, '.png');
  const r = bbox(path.join(DIR, f));
  const n = (v) => Number(v.toFixed(4));
  console.log(`${key.padEnd(20)} 占宽 ${(r.cw * 100).toFixed(0)}%  占高 ${(r.ch * 100).toFixed(0)}%`);
  return `  ${key}: { x: ${n(r.x)}, y: ${n(r.y)}, w: ${n(r.cw)}, h: ${n(r.ch)} },`;
});

fs.writeFileSync(OUT,
`// 自动生成，别手改。重新生成：node scripts/measure-pet-art.mjs
//
// 每张宠物图里「真正画了东西」的那块矩形，用画布比例表示（0~1）。
// 画框那种整幅展示要用它把留白扣掉，否则幼年宠物会缩成一小坨。

export type ArtBox = { x: number; y: number; w: number; h: number };

export const PET_ART_BOX: Record<string, ArtBox> = {
${rows.join('\n')}
};
`, 'utf8');
console.log(`\n✓ ${files.length} 张 → ${OUT}`);
