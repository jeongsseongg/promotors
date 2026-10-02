/* Existing app owns authentication/navigation; notification IDs are resolved on the server first. */
(() => {
  'use strict';
  let transition = Promise.resolve();
  let pendingId = new URL(location.href).searchParams.get('notification') || '';
  let unread = null, observedButton;
  function updateBadge() {
    const label = document.querySelector('#mypage-alerts em');
    const text = unread ? `읽지 않은 알림 ${unread}개` : '새 알림 없음';
    if (label && unread !== null && label.textContent !== text) label.textContent = text;
  }
  async function notificationRpc(name, params) {
    const result = await supabaseRpc(name, params);
    if (params.p_action === 'state') { unread = result.items.filter(item => !item.read_at).length; updateBadge(); }
    return result;
  }
  const api = PMNotifications.create({ rpc: notificationRpc, getToken: () => authToken, openTarget });
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
        showView('adm-book');
        adm.branch = booking.branch; adm.selDate = booking.date;
        return renderAdmBook();
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
    if (authToken && localStorage.getItem('pm-push-opt-in-v1')) await enable().catch(() => {});
    await api.restore().catch(() => {});
    if (!pendingId) return;
    if (!authToken) { openMemberModal('login'); return; }
    const id = pendingId; pendingId = '';
    const url = new URL(location.href); url.searchParams.delete('notification');
    history.replaceState(history.state, '', url);
    await openTarget({ notificationId: id });
  }
  function disconnect() {
    unread = null;
    transition = api.disconnect().catch(() => {});
    return transition;
  }
  window.PMPush = {
    enable, open: () => authToken ? api.open() : openMemberModal('login'), disconnect,
    sessionChanged: () => { transition = transition.then(resume); return transition; }
  };
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
    } else if (event.data?.type === 'PM_PUSH_REFRESH') window.PMPush.sessionChanged();
  });
  window.addEventListener('storage', event => {
    if (event.key === 'pm-auth-token') {
      // Shared device binding must never silently follow another account in an old tab.
      disconnect().finally(() => { if (authToken !== event.newValue) location.reload(); });
    }
  });
  window.addEventListener('focus', () => { if (document.visibilityState === 'visible') window.PMPush.sessionChanged(); });
})();
