// Convert every JPG/PNG under public/img/products to WebP (max 1600px wide),
// delete the original and rewrite references in src/data/products.tabu.json.
// usage: npm run optimize-images
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'public', 'img', 'products');
const DATA = path.join(ROOT, 'src', 'data', 'products.tabu.json');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

(async () => {
  const files = walk(IMG_DIR).filter((f) => /\.(jpe?g|png)$/i.test(f));
  let before = 0, after = 0;
  for (const file of files) {
    const out = file.replace(/\.(jpe?g|png)$/i, '.webp');
    before += fs.statSync(file).size;
    // gallery shots (g*) keep more detail than description images (d*)
    const isGallery = path.basename(file).startsWith('g');
    await sharp(file).rotate()
      .resize({ width: isGallery ? 1600 : 1200, withoutEnlargement: true })
      .webp({ quality: isGallery ? 80 : 74 })
      .toFile(out);
    after += fs.statSync(out).size;
    fs.unlinkSync(file);
  }
  if (fs.existsSync(DATA)) {
    const json = fs.readFileSync(DATA, 'utf8').replace(/(\/img\/products\/[^"\s]+?)\.(jpe?g|png)/gi, '$1.webp');
    fs.writeFileSync(DATA, json);
  }
  const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
  console.log(`${files.length} images: ${mb(before)} -> ${mb(after)}`);
})();
