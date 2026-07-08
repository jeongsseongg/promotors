const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'dist');
const files = ['index.html', 'style.css', 'app.js', 'robots.txt', 'sitemap.xml'];
const dirs = ['images'];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(outDir, file));
}

for (const dir of dirs) {
  const src = path.join(root, dir);
  if (fs.existsSync(src)) {
    fs.cpSync(src, path.join(outDir, dir), { recursive: true });
  }
}

console.log(`Built static site in ${outDir}`);

