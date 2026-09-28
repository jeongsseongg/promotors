/* Push payloads never choose navigation URLs. The app resolves notification IDs after authentication. */
(() => {
  'use strict';
  const DATABASE = 'pm-push';
  const STORE = 'state';
  let pendingBinding = Promise.resolve();
  function database() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function binding(write, value) {
    const db = await database();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, write ? 'readwrite' : 'readonly');
        const store = transaction.objectStore(STORE);
        const request = write ? store.put(value, 'binding') : store.get('binding');
        let result;
        request.onsuccess = () => { result = request.result; };
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Binding transaction aborted'));
      });
    } finally { db.close(); }
  }
  function sameOrigin(url) {
    try { return new URL(url).origin === self.location.origin; }
    catch { return false; }
  }
  function validId(id) {
    return (typeof id === 'string' || typeof id === 'number') && /^[a-zA-Z0-9_-]{1,128}$/.test(String(id));
  }
  async function closeDisplayed() {
    for (const notification of await self.registration.getNotifications()) notification.close();
  }
  function changeBinding(value) {
    pendingBinding = pendingBinding.catch(() => {}).then(async () => {
      await binding(true, value);
      await closeDisplayed();
    });
    return pendingBinding;
  }
  async function matchesBinding(value) {
    if (typeof value !== 'string' || !value) return false;
    try {
      await pendingBinding;
      return value === await binding(false);
    } catch { return false; }
  }
  self.addEventListener('message', event => {
    if (event.data?.type !== 'PM_PUSH_BINDING' || !sameOrigin(event.source?.url)) return;
    const value = typeof event.data.binding === 'string' ? event.data.binding : null;
    event.waitUntil(changeBinding(value).then(() => event.ports?.[0]?.postMessage({ ok: true })));
  });
  self.addEventListener('push', event => {
    event.waitUntil((async () => {
      let payload;
      try { payload = event.data?.json(); } catch { return; }
      if (!payload || !validId(payload.id) || !await matchesBinding(payload.binding)) return;
      const marketing = payload.category === 'marketing';
      await self.registration.showNotification(marketing ? '(광고) 프로모터스' : '프로모터스 알림', {
        body: marketing ? '이벤트 안내가 있습니다. 수신거부: 앱 알림 설정' : '새로운 안내가 도착했습니다. 앱에서 확인해 주세요.',
        icon: '/images/logo-icon.png',
        tag: `pm-notification-${payload.id}`,
        renotify: false,
        data: { id: String(payload.id), target: payload.target || null, binding: payload.binding }
      });
      if (!await matchesBinding(payload.binding)) await closeDisplayed();
    })());
  });
  self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil((async () => {
      const data = event.notification.data;
      if (!data || !validId(data.id) || !await matchesBinding(data.binding)) return;
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = windows.find(item => sameOrigin(item.url));
      if (client) {
        client.postMessage({ type: 'PM_PUSH_OPEN', id: String(data.id) });
        await client.focus();
      } else {
        const url = new URL('/', self.location.origin);
        url.searchParams.set('notification', String(data.id));
        await self.clients.openWindow(url.href);
      }
    })());
  });
  self.addEventListener('pushsubscriptionchange', event => {
    event.waitUntil((async () => {
      await changeBinding(null);
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (sameOrigin(client.url)) client.postMessage({ type: 'PM_PUSH_REFRESH' });
      }
    })());
  });
})();
