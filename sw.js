/* 프로모터스 서비스워커 — 홈 화면 추가(PWA 설치)용 최소 구성.
   데이터는 항상 네트워크를 사용하고, 오프라인 캐시는 하지 않는다. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
