// Loopback-only preview; fixture mode never talks to the production API.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../ios-app/web');
const fixture = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/notifications/notifications.css"><link rel="stylesheet" href="/notifications/permissions.css"></head><body><main><h1>프로모터스</h1><p>예약부터 정비 과정까지</p><a href="/">예약하기</a></main><script src="/fixture.js"></script><script src="/notifications/permissions.js"></script></body></html>`;
const mock = `const params = new URLSearchParams(location.search); if(params.has('fresh')){localStorage.removeItem('pm-permission-intro-v1');localStorage.removeItem('pm-push-opt-in-v1');} window.Capacitor={isNativePlatform:()=>true,isPluginAvailable:()=>false};window.PMNativePush={available:true,request:async()=>params.get('permission')||'granted'};window.PMPush={enable:async()=>{if(params.has('error'))throw new Error('연결 오류입니다. 다시 시도해 주세요.');return params.has('login')}};`;
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/fixture') { res.setHeader('content-type', 'text/html; charset=utf-8'); return res.end(fixture); }
  if (url.pathname === '/fixture.js') { res.setHeader('content-type', 'text/javascript'); return res.end(mock); }
  const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; return res.end(); }
  const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2' };
  res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
}).listen(4187, '127.0.0.1', () => console.log('Permission preview: http://127.0.0.1:4187/fixture'));
