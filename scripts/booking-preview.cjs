// Local synthetic bookings only; this preview cannot call the production API.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../ios-app/web');
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.end('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/notifications/notifications.css"><link rel="stylesheet" href="/notifications/booking-actions.css"></head><body class="native-app"><main><h1>프로모터스 예약 검증</h1><p>합성 데이터 · 운영 고객에게 발송하지 않습니다</p><button id="open">예약 열기</button><button id="tests">동작 검증</button><pre id="result"></pre><section id="pending"></section></main><script type="module" src="/fixture.js"></script></body></html>');
  }
  const file = url.pathname === '/fixture.js' ? path.resolve(__dirname, 'booking-fixture.mjs') : path.resolve(root, '.' + url.pathname);
  if (!file.startsWith(root + path.sep) && file !== path.resolve(__dirname, 'booking-fixture.mjs')) { res.statusCode = 403; return res.end(); }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', /\.(m?js)$/.test(file) ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(52861, '127.0.0.1', () => console.log('Booking preview http://127.0.0.1:52861'));

