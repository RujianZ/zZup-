/**
 * 从 assets/logo.png 生成 App 图标的三个层。
 *
 * 为什么不能直接把原图当图标用：
 *
 * 1. **原图烤进了圆角。** iOS 会再套一层自己的遮罩，双重圆角会在角上露出
 *    一圈缺口；Android 的启动器还会按自己的形状（圆/方/水滴）再裁一次。
 *    图标必须是**满幅方图**，圆角交给系统。
 *    做法：把原图合成到纯黑底上 —— 圆角外那圈透明/白边变成黑，和背景融为一体。
 *
 * 2. **Android 自适应图标的外圈约 1/3 会被裁掉。** 前景层必须把图形缩到
 *    中间的安全区，否则 Z 的笔锋会被切。做法：72% 缩放居中放在透明画布上。
 *
 * 3. 单色层（Android 13+ 主题图标）要的是**形状不是颜色**：按亮度取 alpha。
 *
 * 重新生成：node scripts/make-icons.mjs
 */
import fs from 'node:fs';
import { PNG } from 'pngjs';

const SRC = 'assets/logo.png';

/** 双线性缩放。最近邻在这种笔触图上会出锯齿。 */
function resize(src, w, h) {
  const out = new PNG({ width: w, height: h });
  const sx = src.width / w;
  const sy = src.height / h;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(src.height - 1, (y + 0.5) * sy - 0.5);
    const y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(src.height - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(src.width - 1, (x + 0.5) * sx - 0.5);
      const x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(src.width - 1, x0 + 1);
      const wx = fx - x0;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        const p00 = src.data[(y0 * src.width + x0) * 4 + c];
        const p01 = src.data[(y0 * src.width + x1) * 4 + c];
        const p10 = src.data[(y1 * src.width + x0) * 4 + c];
        const p11 = src.data[(y1 * src.width + x1) * 4 + c];
        out.data[o + c] =
          Math.round(p00 * (1 - wx) * (1 - wy) + p01 * wx * (1 - wy) +
                     p10 * (1 - wx) * wy + p11 * wx * wy);
      }
    }
  }
  return out;
}

/**
 * 把圆角外那圈**不透明的白**（实测 rgba(254,253,253,255)）填成黑。
 *
 * 不能简单地「近白 → 黑」：Z 的笔触里有大量近白的高光，一刀切会把笔触打穿。
 * 用从四角开始的泛洪填充 —— 白边是连通到画布角的，而 Z 不碰角，
 * 所以填到的正好只有外圈那一圈。
 */
function fillBorderBlack(img) {
  const { width: w, height: h } = img;
  const out = new PNG({ width: w, height: h });
  img.data.copy(out.data);

  const isPale = (i) =>
    out.data[i + 3] < 8 ||                                    // 透明
    (out.data[i] > 230 && out.data[i + 1] > 230 && out.data[i + 2] > 230); // 近白

  const seen = new Uint8Array(w * h);
  const stack = [0, w - 1, (h - 1) * w, h * w - 1];
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    const i = p * 4;
    if (!isPale(i)) continue;
    seen[p] = 1;
    out.data[i] = 0; out.data[i + 1] = 0; out.data[i + 2] = 0; out.data[i + 3] = 255;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }

  // 剩下的透明像素（如果还有）压到黑底上
  for (let i = 0; i < out.data.length; i += 4) {
    const a = out.data[i + 3] / 255;
    out.data[i]     = Math.round(out.data[i]     * a);
    out.data[i + 1] = Math.round(out.data[i + 1] * a);
    out.data[i + 2] = Math.round(out.data[i + 2] * a);
    out.data[i + 3] = 255;
  }
  return out;
}

/**
 * 抠出图形本身：黑色背景变透明，笔触保留。
 * 用亮度当 alpha —— 笔触是亮的紫粉，背景是纯黑，这条界线很干净。
 */
function keyOutBlack(img) {
  const out = new PNG({ width: img.width, height: img.height });
  for (let i = 0; i < img.data.length; i += 4) {
    const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    // 原图本身的 alpha 也要乘进去（圆角外那圈）
    const a = Math.min(255, Math.round(lum * 1.6)) * (img.data[i + 3] / 255);
    out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b;
    out.data[i + 3] = Math.round(a);
  }
  return out;
}

/** 把 img 按 scale 缩放后居中放进 size×size 的透明画布。 */
function padCentered(img, size, scale) {
  const inner = Math.round(size * scale);
  const small = resize(img, inner, inner);
  const out = new PNG({ width: size, height: size });
  out.data.fill(0);
  const off = Math.round((size - inner) / 2);
  for (let y = 0; y < inner; y++) {
    for (let x = 0; x < inner; x++) {
      const s = (y * inner + x) * 4;
      const d = ((y + off) * size + (x + off)) * 4;
      out.data[d] = small.data[s];
      out.data[d + 1] = small.data[s + 1];
      out.data[d + 2] = small.data[s + 2];
      out.data[d + 3] = small.data[s + 3];
    }
  }
  return out;
}

/** 单色层：只要形状。颜色一律白，alpha 来自亮度。 */
function toMonochrome(img) {
  const out = new PNG({ width: img.width, height: img.height });
  for (let i = 0; i < img.data.length; i += 4) {
    out.data[i] = 255; out.data[i + 1] = 255; out.data[i + 2] = 255;
    out.data[i + 3] = img.data[i + 3];
  }
  return out;
}

const write = (png, path) => {
  fs.writeFileSync(path, PNG.sync.write(png));
  const b = fs.readFileSync(path);
  console.log(`  ${png.width}x${png.height}`.padEnd(14), `${(b.length / 1024).toFixed(0)}KB`.padEnd(8), path);
};

const raw = PNG.sync.read(fs.readFileSync(SRC));
const src = fillBorderBlack(raw);   // 先把白边填黑，再做后面所有处理
console.log(`源图 ${src.width}x${src.height}\n`);

// 1. iOS / 商店图标：满幅方图，无透明，无烤死的圆角
console.log('图标（满幅，圆角交给系统）：');
write(resize(src, 1024, 1024), 'assets/icon.png');

// 2. Android 自适应前景：抠掉黑底，缩到 72% 安全区
console.log('\nAndroid 自适应前景（72% 安全区，外圈会被裁）：');
write(padCentered(keyOutBlack(src), 1024, 0.72), 'assets/android-icon-foreground.png');

// 3. Android 单色（主题图标）
console.log('\nAndroid 单色层：');
write(toMonochrome(padCentered(keyOutBlack(src), 1024, 0.72)), 'assets/android-icon-monochrome.png');

// 4. 启动屏：跟图标同一张，透明底（背景色由 app.json 给）
console.log('\n启动屏：');
write(padCentered(keyOutBlack(src), 1024, 0.62), 'assets/splash-icon.png');

console.log('\n⚠️ android-icon-background.png 不再需要 —— 改用纯色 backgroundColor。');
