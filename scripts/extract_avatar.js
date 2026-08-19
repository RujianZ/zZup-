const fs = require('fs');
const path = require('path');

const srcDir = 'C:\\Users\\laifu\\Desktop\\zzup_pic\\role-clothes\\SVG';
const targetDir = path.join(__dirname, '..', 'assets', 'avatar', 'png');

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Clean old files in targetDir
fs.readdirSync(targetDir).forEach(f => {
  fs.unlinkSync(path.join(targetDir, f));
});

const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.svg'));
console.log(`Processing ${files.length} SVG files...`);

const mapping = {};

files.forEach(file => {
  const filePath = path.join(srcDir, file);
  const content = fs.readFileSync(filePath, 'utf8');

  const base64Match = content.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
  if (!base64Match) return;

  const imgIdMatch = content.match(/<image[^>]+id="([^"]+)"/i);
  let rawName = imgIdMatch ? imgIdMatch[1] : file.replace('.svg', '');

  // Normalize name
  let cleanKey = rawName
    .toLowerCase()
    .replace(/_pink/g, '')
    .replace(/_pi_nk/g, '')
    .replace(/-/g, '_')
    .replace(/\s+/g, '_');

  const outFileName = `${cleanKey}.png`;
  const outPath = path.join(targetDir, outFileName);

  const buffer = Buffer.from(base64Match[1], 'base64');
  fs.writeFileSync(outPath, buffer);

  mapping[cleanKey] = outFileName;
});

console.log(`Saved ${Object.keys(mapping).length} normalized PNGs.`);
console.log(mapping);
