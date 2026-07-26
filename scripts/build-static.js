const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'dist');
const files = ['index.html', 'style.css', 'config.js', 'app.js', 'robots.txt', 'sitemap.xml', 'manifest.webmanifest', 'sw.js'];
const dirs = ['images'];

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

for (const dir of dirs) {
  const src = path.join(root, dir);
  if (fs.existsSync(src)) {
    fs.cpSync(src, path.join(outDir, dir), { recursive: true });
  }
}

console.log(`Built static site in ${outDir}`);
