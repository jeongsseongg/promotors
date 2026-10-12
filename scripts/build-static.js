const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'dist');
const files = ['index.html', 'style.css', 'config.js', 'app.js', 'robots.txt', 'sitemap.xml', 'manifest.webmanifest', 'sw.js', 'account-pages.css', '_headers'];
const dirs = ['app-launch', 'images', 'fonts', 'design-guidelines', 'notifications', 'privacy', 'account-deletion', '.well-known'];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

/* 캐시 무효화: 빌드 시각으로 ?v= 버전을 자동 갱신해 배포 후 이전 js/css 캐시가 남지 않게 한다 */
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 12);

for (const file of files) {
  if (file === 'index.html') {
    const html = fs.readFileSync(path.join(root, file), 'utf8')
      .replace(/\?v=[\w.-]+/g, `?v=${stamp}`);
    fs.writeFileSync(path.join(outDir, file), html);
  } else {
    fs.copyFileSync(path.join(root, file), path.join(outDir, file));
  }
}

function copyDirectory(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    else fs.copyFileSync(from, to);
  }
}

for (const dir of dirs) {
  const src = path.join(root, dir);
  if (dir === 'notifications') {
    const dest = path.join(outDir, dir);
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      if (entry.isFile() && /\.(js|css|wav)$/.test(entry.name)) {
        fs.copyFileSync(path.join(src, entry.name), path.join(dest, entry.name));
      }
    }
    continue;
  }
  if (fs.existsSync(src)) copyDirectory(src, path.join(outDir, dir));
}

console.log(`Built static site in ${outDir}`);
