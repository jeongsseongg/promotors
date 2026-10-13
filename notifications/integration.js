/* Existing app owns authentication/navigation; notification IDs are resolved on the server first. */
(async () => {
  'use strict';
  PM_PRIVATE_MUTATORS.add('pm_admin_booking_actions');
  PM_PRIVATE_MUTATORS.add('pm_native_push_subscribe');
  let transition = Promise.resolve();
  let pendingId = new URL(location.href).searchParams.get('notification') || '';
  let pendingBooking = new URL(location.href).searchParams.get('booking') || '';
  let pendingBookingAction = new URL(location.href).searchParams.get('bookingAction') || '';
  const bookingAction = value => ['accept', 'reject'].includes(value) ? value : '';
  let sessionEpoch = 0, pendingBookingEpoch = 0, pendingBookingOwner = authToken || '';
  let pendingBookingBinding = new URL(location.href).searchParams.get('bookingBinding') || '';
  let pendingNativeAction = false;
  function queueBooking(data, native = false) {
    pendingBooking = String(data.id || ''); pendingBookingAction = bookingAction(data.action);
    pendingBookingBinding = String(data.binding || ''); pendingNativeAction = native && data.trustedAction === true;
    pendingBookingOwner = authToken || ''; pendingBookingEpoch = sessionEpoch;
    window.PMPush?.sessionChanged();
  }
  window.addEventListener('pm-native-booking-open', event => {
    queueBooking(event.detail || {}, true);
  });
  let unread = null, observedButton, optInErrorShown = false;
  async function privateRpc(name, params) {
    if (PM_PRIVATE_MUTATORS.has(name)) {
      try { window.PMPrivacyEpoch.headers(); }
      catch (error) {
        if (error.code !== 'PRIVACY_EPOCH_NOT_READY' && error.message !== 'PRIVACY_EPOCH_NOT_READY') throw error;
        const context = await hydrateSupabaseData();
        if (!context.ok) throw new Error('계정 정보를 확인하지 못했습니다. 다시 시도해 주세요.');
      }
    }
    return supabaseRpc(name, params);
  }
  function updateBadge() {
    const label = document.querySelector('#mypage-alerts em');
    const text = unread ? `읽지 않은 알림 ${unread}개` : '새 알림 없음';
    if (label && unread !== null && label.textContent !== text) label.textContent = text;
  }
  async function notificationRpc(name, params) {
    const result = await privateRpc(name, params);
    if (params.p_action === 'state') { unread = result.items.filter(item => !item.read_at).length; updateBadge(); }
    return result;
  }
  const styles = document.createElement('link');
  styles.rel = 'stylesheet'; styles.href = 'notifications/booking-actions.css?v=20261013-customers';
  document.head.append(styles);
  const { createBookingActions } = await import('./booking-actions.js?v=20261013-customers-actions');
  const { createBookingSchedule } = await import('./booking-schedule.js?v=20261013-customers');
  const bookings = createBookingActions({ rpc: privateRpc, getToken: () => authToken, isAdmin: () => isAdmin,
    canView: branch => isTopAdmin() || adminBranches.includes(branch),
    onChanged: async result => {
      const registration = await navigator.serviceWorker?.getRegistration().catch(() => null);
      registration?.active?.postMessage({ type: 'PM_BOOKING_PROCESSED', id: result.booking.id });
      await hydrateSupabaseData();
      if (result.changed && result.booking.status === '예약') pushCustomerMessage(result.booking, `${result.booking.branch} ${result.booking.date} ${result.booking.time} 예약이 확정되었습니다.`, { bookingId: result.booking.id, type: 'booking-approved' });
      if (isAdmin) renderAdmBook();
    }
  });
  const schedule = createBookingSchedule(bookings);
  window.PMBookingSchedule = schedule;
  const { attachBookingDevice } = await import('./booking-device.js?v=20261013-customers');
  attachBookingDevice(bookings);
  const api = PMNotifications.create({ rpc: notificationRpc, getToken: () => authToken, openTarget, bookings });
  new MutationObserver(() => {
    const current = document.getElementById('mypage-alerts');
    if (!current || current === observedButton) return;
    observedButton = current; updateBadge();
    if (authToken) notificationRpc('pm_notifications', {p_token:authToken,p_action:'state',p_data:{}}).catch(() => {});
  }).observe(document.body, {childList:true,subtree:true});
  async function openTarget(target) {
    try {
      if (target.notificationId) target = await supabaseRpc('pm_notifications', {
        p_token: authToken, p_action: 'resolve', p_data: { id: target.notificationId }
      });
      await hydrateSupabaseData();
      if (target.kind === 'inbox') return api.open();
      if (isAdmin) {
        if (target.branch && !canAccessBranch(target.branch)) throw new Error('FORBIDDEN');
        if (target.kind === 'inquiry') {
          const msg = store.get('pm-messages', []).find(row => row.id === target.id);
          if (!msg) throw new Error('NOT_FOUND');
          const customer = store.get('pm-members', []).find(row => row.id === msg.memberId);
          if (!customer) throw new Error('NOT_FOUND');
          return openCustomerCenterModal(customer);
        }
        if (target.kind === 'repair') return openRunAlbumModal(target.id, { allowDelete: true });
        const booking = getBookings().find(row => row.id === target.id);
        if (!booking) throw new Error('NOT_FOUND');
        return bookings.open(booking.id);
      }
      if (!member) throw new Error('AUTH_REQUIRED');
      if (target.kind === 'repair') return openWorkStatusPage();
      if (target.kind === 'events') return openMyEventsPage();
      return openMyBookingsPage();
    } catch {
      await pmAlert('알림 내용을 열 수 없습니다. 로그인 상태와 예약·작업 권한을 확인해 주세요.');
    }
  }
  async function enable() {
    if (!authToken) return false;
    await api.enable();
    localStorage.removeItem('pm-push-opt-in-v1');
    return true;
  }
  async function resume() {
    const epoch = sessionEpoch, owner = authToken;
    if (authToken && localStorage.getItem('pm-push-opt-in-v1')) {
      try { await enable(); optInErrorShown = false; }
      catch {
        if (!optInErrorShown) {
          optInErrorShown = true;
          await pmAlert('알림 권한은 허용됐지만 계정 연결을 완료하지 못했습니다. 알림 설정에서 다시 연결해 주세요.');
        }
      }
    }
    await api.restore().catch(() => {});
    await bookings.start().catch(() => {});
    if (pendingBooking) {
      if (!authToken) { openMemberModal('login'); return; }
      const id = pendingBooking, requested = bookingAction(pendingBookingAction);
      const bindingMatches = pendingBookingBinding && (pendingNativeAction
        ? pendingBookingBinding === window.PMNativePush?.binding : pendingBookingBinding === window.PMWebPushBinding);
      const action = requested && bindingMatches && pendingBookingOwner === authToken && pendingBookingEpoch === sessionEpoch ? requested : '';
      pendingBooking = ''; pendingBookingAction = ''; pendingBookingBinding = ''; pendingNativeAction = false;
      const url = new URL(location.href); url.searchParams.delete('booking'); url.searchParams.delete('bookingAction'); url.searchParams.delete('bookingBinding');
      history.replaceState(history.state, '', url);
      try { if (requested) await bookings.open(id, action ? { action } : {}); else await bookings.openSchedule(id); }
      catch { await pmAlert('예약 일정을 열 수 없습니다. 관리자 로그인과 지점 권한을 확인해 주세요.'); }
    }
    if (!pendingId) return;
    if (!authToken) { openMemberModal('login'); return; }
    const id = pendingId; pendingId = '';
    const url = new URL(location.href); url.searchParams.delete('notification');
    history.replaceState(history.state, '', url);
    await openTarget({ notificationId: id });
  }
  function disconnect() {
    bookings.reset();
    unread = null;
    transition = api.disconnect().catch(() => {});
    return transition;
  }
  window.PMBookingActions = bookings;
  bookings.openSchedule = async id => {
    if (id) {
      const result = await privateRpc('pm_admin_booking_actions', { p_token: authToken, p_action: 'get', p_data: { id } });
      if (!isAdmin || !canAccessBranch(result.booking?.branch)) throw new Error('FORBIDDEN');
    }
    return schedule.open(id);
  };
  window.PMPush = {
    enable, open: async () => { if (!authToken) return openMemberModal('login'); await bookings.start().catch(() => {}); return api.open(); }, disconnect,
    sessionChanged: () => { transition = transition.then(resume); return transition; }
  };
  window.addEventListener('load', () => {
    if (window.PMPermissions) return;
    const styles = document.createElement('link');
    styles.rel = 'stylesheet'; styles.href = 'notifications/permissions.css?v=20261002';
    document.head.append(styles);
    import('./permissions.js?v=20261002').catch(() => console.warn('알림 권한 안내를 불러오지 못했습니다.'));
  }, { once: true });
  document.addEventListener('click', event => {
    if (event.target.closest('#mypage-alerts, #admin-push-settings')) {
      event.preventDefault(); event.stopImmediatePropagation(); window.PMPush.open();
    }
  }, true);
  window.addEventListener('pm-native-notification', event => {
    pendingId = String(event.detail.id || ''); window.PMPush.sessionChanged();
  });
  navigator.serviceWorker?.addEventListener('message', event => {
    if (event.data?.type === 'PM_PUSH_OPEN') {
      pendingId = String(event.data.id || ''); window.PMPush.sessionChanged();
    } else if (event.data?.type === 'PM_BOOKING_SCHEDULE_OPEN') {
      queueBooking(event.data);
    } else if (event.data?.type === 'PM_PUSH_REFRESH') window.PMPush.sessionChanged();
  });
  window.addEventListener('storage', event => {
    if (event.key === 'pm-auth-token') {
      // Shared device binding must never silently follow another account in an old tab.
      disconnect().finally(() => { if (authToken !== event.newValue) location.reload(); });
    }
  });
  window.PMPush.sessionChanged();
  window.addEventListener('focus', () => { if (document.visibilityState === 'visible') window.PMPush.sessionChanged(); });
})();
