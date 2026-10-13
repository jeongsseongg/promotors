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
  async function displaySchedule(state, currentBinding) {
    if (!await matchesBinding(currentBinding)) return;
    const notices = await self.registration.getNotifications();
    const count = Number(state?.pendingCount) + Number(state?.upcomingCount);
    if (!state || !Number.isFinite(count) || count <= 0 || !validId(state.bookingId)) {
      for (const notice of notices) if (notice.data?.schedule) notice.close();
      return;
    }
    const pending = Number(state.pendingCount) > 0;
    const minutes = Math.ceil((Number(state.startsAt) * 1000 - Date.now()) / 60000);
    const remaining = !Number.isFinite(minutes) ? '' : minutes <= 0 ? '예약 시간 지남' : minutes < 60 ? `${minutes}분 후` : `${Math.floor(minutes / 60)}시간 ${minutes % 60}분 후`;
    await self.registration.showNotification('프로모터스 예약 일정', {
      body: `${String(state.branch || '프로모터스').slice(0, 60)} · ${String(state.schedule || '').slice(0, 60)}\n${pending ? `수락 대기 ${state.pendingCount}건` : `방문 예정 ${state.upcomingCount}건`} · ${remaining}\n눌러서 예약 일정 확인`,
      icon: '/images/logo-icon.png', tag: 'pm-booking-pending-overview',
      requireInteraction: true, silent: true, renotify: false,
      data: { schedule: true, persistent: true, bookingId: String(state.bookingId), binding: currentBinding }
    });
    if (!await matchesBinding(currentBinding)) await closeDisplayed();
  }
  self.addEventListener('message', event => {
    if (event.data?.type === 'PM_BOOKING_SNAPSHOT' && sameOrigin(event.source?.url)) {
      event.waitUntil(displaySchedule(event.data.state, event.data.binding)); return;
    }
    if (event.data?.type === 'PM_BOOKING_PROCESSED' && sameOrigin(event.source?.url) && validId(event.data.id)) {
      event.waitUntil((async () => {
        for (const notice of await self.registration.getNotifications()) {
          if (!notice.data?.schedule && notice.data?.bookingId === String(event.data.id)) notice.close();
        }
      })());
      return;
    }
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
      const booking = payload.booking;
      const pending = booking?.pending === true && validId(booking.id);
      await self.registration.showNotification(marketing ? '(광고) 프로모터스' : '프로모터스 알림', {
        body: pending ? `${booking.branch} · ${booking.schedule}\n새 예약 · 눌러서 예약 일정 확인` : marketing ? '이벤트 안내가 있습니다. 수신거부: 앱 알림 설정' : '새로운 안내가 도착했습니다. 앱에서 확인해 주세요.',
        icon: '/images/logo-icon.png',
        tag: `pm-notification-${payload.id}`,
        requireInteraction: false,
        renotify: false,
        data: { id: String(payload.id), bookingId: booking?.id, persistent: false, binding: payload.binding }
      });
      if (booking?.snapshot) await displaySchedule(booking.snapshot, payload.binding);
      if (!await matchesBinding(payload.binding)) await closeDisplayed();
    })());
  });
  self.addEventListener('notificationclick', event => {
    if (!event.notification.data?.persistent) event.notification.close();
    event.waitUntil((async () => {
      const data = event.notification.data;
      const id = data?.schedule ? data.bookingId : data?.id;
      if (!data || !validId(id) || !await matchesBinding(data.binding)) return;
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = windows.find(item => sameOrigin(item.url));
      if (client) {
        client.postMessage({ type: data.schedule ? 'PM_BOOKING_SCHEDULE_OPEN' : 'PM_PUSH_OPEN', id: String(id) });
        await client.focus();
      } else {
        const url = new URL('/', self.location.origin);
        url.searchParams.set(data.schedule ? 'booking' : 'notification', String(id));
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
