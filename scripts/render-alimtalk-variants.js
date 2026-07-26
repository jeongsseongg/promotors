const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const assetDir = path.join(root, 'images', 'alimtalk');

function dataUrl(filePath, mime) {
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

const font = dataUrl('C:\\Windows\\Fonts\\NotoSansKR-VF.ttf', 'font/ttf');
const logo = dataUrl(path.join(root, 'images', 'logo-lockup.png'), 'image/png');
const variants = [
  {
    filename: 'promotors-ansan-reservation-confirmed-v4.png',
    background: 'bg-dark-sedan-v1.png',
    eyebrow: '\ud504\ub85c\ubaa8\ud130\uc2a4 \uc548\uc0b0\uc810',
    title: '\uc815\ube44 \uc608\uc57d\uc774<br><em>\ud655\uc815\ub410\uc5b4\uc694</em>',
    description: '\uacf5\uc2dd \ud648\ud398\uc774\uc9c0 \ud68c\uc6d0\uac00\uc785 \ud55c \ubc88\uc73c\ub85c \ub0b4 \ucc28 \uad00\ub9ac<br>\uc785\uace0\ubd80\ud130 \ucd9c\uace0\uae4c\uc9c0 \uc815\ube44 \uacfc\uc815\uacfc<br>\uc791\uc5c5 \uc0ac\uc9c4\uc744 \uc9c1\uc811 \ud655\uc778\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.',
    note: '\ud68c\uc6d0\uac00\uc785 \ud6c4 \uc774\uc6a9 \uac00\ub2a5',
    theme: 'dark',
    special: true
  },
  {
    filename: 'promotors-ansan-service-status-v1.png',
    background: 'bg-inspection-v1.png',
    eyebrow: '\ub0b4 \ucc28 \uc815\ube44\ub97c \ub354 \ud3b8\ub9ac\ud558\uac8c',
    title: '\ub0b4 \ucc28 \uc815\ube44,<br><em>\uc9c0\uae08 \uc5b4\ub514\uae4c\uc9c0?</em>',
    description: '\uc811\uc218\ubd80\ud130 \uc791\uc5c5 \uc0ac\uc9c4\uae4c\uc9c0<br>\ud55c\uacf3\uc5d0\uc11c \ud3b8\ud558\uac8c \ud655\uc778\ud558\uc138\uc694.',
    note: '\uacf5\uc2dd \ud648\ud398\uc774\uc9c0 \ud68c\uc6d0\uac00\uc785 \ud6c4 \uc774\uc6a9 \uac00\ub2a5',
    theme: 'dark'
  },
  {
    filename: 'promotors-ansan-member-guide-v1.png',
    background: 'bg-bright-suv-v1.png',
    eyebrow: '\ud504\ub85c\ubaa8\ud130\uc2a4 \uacf5\uc2dd \ud648\ud398\uc774\uc9c0',
    title: '\uc815\ube44 \uc18c\uc2dd\uc744<br><em>\ub193\uce58\uc9c0 \ub9c8\uc138\uc694</em>',
    description: '\uc608\uc57d\uacfc \uc791\uc5c5 \uc9c4\ud589 \uc0c1\ud669\uc744<br>\ud544\uc694\ud560 \ub54c \ubc14\ub85c \ud655\uc778\ud560 \uc218 \uc788\uc5b4\uc694.',
    note: '\ud68c\uc6d0\uac00\uc785 \ud6c4 \uc774\uc6a9 \uac00\ub2a5',
    theme: 'light'
  }
];

function markup(variant, square = false) {
  const background = dataUrl(path.join(assetDir, variant.background), 'image/png');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    @font-face{font-family:"Promotors Sans";src:url("${font}") format("truetype");font-weight:100 900;font-display:swap}
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}
    body{font-family:"Promotors Sans","Noto Sans KR",sans-serif;word-break:keep-all}
    .card{position:relative;width:100%;height:100%;overflow:hidden;background-image:url("${background}");background-size:cover;background-position:center;color:#f8fafc}
    .card::before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(4,14,28,.98) 0%,rgba(4,14,28,.91) 39%,rgba(4,14,28,.28) 61%,rgba(4,14,28,.05) 100%)}
    .content{position:relative;z-index:1;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;width:56%;height:100%;padding:34px 52px;transform:translateY(30px)}
    .brand{position:absolute;z-index:2;top:28px;left:52px;width:174px;height:auto;filter:drop-shadow(0 2px 8px rgba(0,0,0,.24))}
    .eyebrow{display:none;margin:18px 0 12px;color:#f6c400;font-size:18px;font-weight:750;letter-spacing:-.02em}
    h1{margin:0;color:#fff;font-size:49px;line-height:1.16;font-weight:830;letter-spacing:-.055em}
    h1 em{color:#f6c400;font-style:normal}
    .description{margin:18px 0 0;color:rgba(255,255,255,.91);font-size:20px;line-height:1.48;font-weight:480;letter-spacing:-.028em}
    .note{display:inline-flex;align-items:center;min-height:38px;margin-top:18px;padding:0 16px;border:1px solid rgba(255,255,255,.3);border-radius:999px;background:rgba(6,18,34,.56);color:#fff;font-size:15px;font-weight:650;backdrop-filter:blur(7px)}
    .special:not(.square) .brand{top:18px;width:150px}
    .special:not(.square) .content{justify-content:flex-start;padding:98px 52px 18px;transform:none}
    .special:not(.square) .eyebrow{display:block;margin:0 0 7px;font-size:17px}
    .special:not(.square) h1{font-size:43px;line-height:1.13}
    .special:not(.square) .description{margin-top:13px;font-size:17px;line-height:1.48}
    .special:not(.square) .note{display:none}
    .light::before{background:linear-gradient(90deg,rgba(248,250,252,.98) 0%,rgba(248,250,252,.94) 42%,rgba(248,250,252,.18) 67%,rgba(248,250,252,0) 100%)}
    .light h1{color:#0c1b2d}.light h1 em{color:#9a6800}.light .eyebrow{color:#765400}.light .description{color:#334155}
    .light .note{border-color:rgba(12,27,45,.16);background:rgba(255,255,255,.78);color:#0c1b2d}
    .square{background-position:62% center}.square::before{background:linear-gradient(180deg,rgba(4,14,28,.97) 0%,rgba(4,14,28,.91) 55%,rgba(4,14,28,.38) 100%)}
    .square .content{justify-content:flex-start;width:100%;padding:54px 24px 18px;transform:none}.square .brand{top:18px;left:24px;width:112px}
    .square .eyebrow{display:block;margin:15px 0 8px;font-size:13px}.square h1{font-size:34px;line-height:1.14}.square .description{display:none}
    .square .note{min-height:31px;margin-top:13px;padding:0 11px;font-size:12px}
  </style></head><body><main class="card ${variant.theme} ${variant.special ? 'special' : ''} ${square ? 'square' : ''}">
    <img class="brand" src="${logo}" alt="">
    <section class="content"><p class="eyebrow">${variant.eyebrow}</p><h1>${variant.title}</h1><p class="description">${variant.description}</p><span class="note">${variant.note}</span></section>
  </main></body></html>`;
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 400 }, deviceScaleFactor: 1 });

  for (const variant of variants) {
    await page.setViewportSize({ width: 800, height: 400 });
    await page.setContent(markup(variant), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(assetDir, variant.filename), type: 'png' });
  }

  await page.setViewportSize({ width: 256, height: 256 });
  await page.setContent(markup(variants[0], true), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(assetDir, 'promotors-ansan-reservation-thumbnail-v2.png'), type: 'png' });
  await browser.close();
})();
