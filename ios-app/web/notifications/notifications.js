(function (global) {
  'use strict';
  const native = global.PMNativePush;
  const getPermission = () => native?.available ? native.permission : global.Notification?.permission;
  const DEVICE_KEY = 'pm-push-device-v1';
  const labels = { booking: '예약 접수·확정·변경·취소', repair: '정비 진행·사진·출고 안내', reminders: '예약 전날·정기점검 알림', marketing: '이벤트·혜택 알림 (선택)' };
  const defaults = { enabled: false, booking: true, repair: true, reminders: true, marketing: false };
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(text, action, className = 'pm-notify-button') {
    const node = element('button', text, className);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }
  function supported() {
    return native?.available || global.isSecureContext && 'Notification' in global && 'PushManager' in global && 'serviceWorker' in navigator;
  }
  function unsupportedMessage() {
    return global.Capacitor?.getPlatform?.() === 'ios'
      ? '현재 아이폰 앱에서는 기기 푸시 알림을 지원하지 않습니다. 앱 안의 알림함은 이용할 수 있습니다.'
      : '이 환경에서는 기기 푸시 알림을 지원하지 않습니다. 앱 안의 알림함은 이용할 수 있습니다.';
  }
  function deviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }
  function applicationKey(value) {
    const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  }
  async function worker() {
    let timer;
    try {
      return await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('앱을 새로 열고 다시 시도해 주세요.')), 10000); })
      ]);
    } finally { clearTimeout(timer); }
  }
  async function requestPermission() {
    if (getPermission() !== 'default') return getPermission();
    let timer;
    try {
      return await Promise.race([
        Notification.requestPermission(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('알림 권한 확인이 지연되고 있습니다. 브라우저 또는 기기 설정에서 알림 권한을 확인한 후 다시 눌러 주세요.')), 20000); })
      ]);
    } finally { clearTimeout(timer); }
  }
  function create({ rpc, getToken, openTarget }) {
    let dialog, content, feedback, busy = false, state, opener, generation = 0, activeTab = 'recent', tabs;
    async function call(action, data = {}, token = getToken()) {
      if (!token) throw new Error('로그인 후 알림을 이용해 주세요.');
      let result = await rpc(action === 'native_subscribe' ? 'pm_native_push_subscribe' : 'pm_notifications', { p_token: token, p_action: action, p_data: data });
      if (result?.error) throw new Error('알림 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      if (result?.data !== undefined) result = result.data;
      if (Array.isArray(result) && result.length === 1 && !result[0]?.title) result = result[0];
      if (result?.ok === false) throw new Error(result.message || '알림 요청을 처리하지 못했습니다.');
      return result || {};
    }
    function status(message, error = false) {
      if (!feedback) return;
      feedback.textContent = message;
      feedback.classList.toggle('pm-notify-error', error);
    }
    async function perform(action) {
      if (busy) return;
      busy = true;
      dialog?.setAttribute('aria-busy', 'true');
      try { await action(); }
      catch (error) { status(error.message || '잠시 후 다시 시도해 주세요.', true); }
      finally { busy = false; dialog?.removeAttribute('aria-busy'); }
    }
    async function refresh() {
      state = await call('state');
      state.preferences = { ...defaults, ...state.preferences };
      state.deviceConnected = false;
      if (native?.available) { await native.check(); state.deviceConnected = native.connected; }
      else if (supported() && getPermission() === 'granted') {
        const registration = await navigator.serviceWorker.getRegistration();
        state.deviceConnected = Boolean(await registration?.pushManager?.getSubscription());
      }
      render();
    }
    async function subscribe() {
      const sessionGeneration = generation;
      if (!supported()) throw new Error(unsupportedMessage());
      const granted = native?.available ? await native.request() : await requestPermission();
      if (granted !== 'granted') throw new Error('기기 설정에서 프로모터스 알림을 허용한 후 다시 켜 주세요.');
      if (sessionGeneration !== generation) throw new Error('로그인 상태가 변경되었습니다. 다시 시도해 주세요.');
      if (native?.available) {
        const token = getToken();
        await native.subscribe((action, data) => call(action, data, token), deviceId());
        if (sessionGeneration !== generation) throw new Error('로그인 상태가 변경되었습니다.');
        await call('preferences', { enabled: true });
        return;
      }
      if (!state.publicKey) throw new Error('알림 발송 준비 중입니다. 잠시 후 다시 시도해 주세요.');
      const registration = await worker();
      let subscription = await registration.pushManager.getSubscription();
      let newlyCreated = false;
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(state.publicKey) });
        newlyCreated = true;
      }
      try {
        if (sessionGeneration !== generation) throw new Error('로그인 상태가 변경되었습니다. 다시 시도해 주세요.');
        const result = await call('subscribe', { subscription: subscription.toJSON(), deviceId: deviceId() });
        if (sessionGeneration !== generation) throw new Error('로그인 상태가 변경되었습니다. 다시 시도해 주세요.');
        registration.active?.postMessage({ type: 'PM_PUSH_BINDING', binding: result.binding || null });
        await call('preferences', { enabled: true });
      } catch (error) {
        if (newlyCreated) await subscription.unsubscribe();
        throw error;
      }
    }
    async function localUnsubscribe() {
      if (native?.available) { await native.clear(); return; }
      const registration = await clearBinding();
      const subscription = await registration?.pushManager?.getSubscription();
      if (subscription) await subscription.unsubscribe();
    }
    async function clearBinding() {
      if (native?.available) { await native.clear(); return; }
      if (!('serviceWorker' in navigator)) return;
      const registration = await navigator.serviceWorker.getRegistration();
      registration?.active?.postMessage({ type: 'PM_PUSH_BINDING', binding: null });
      for (const notification of await registration?.getNotifications() || []) notification.close();
      return registration;
    }
    async function disconnect() {
      const token = getToken();
      generation += 1;
      try {
        await clearBinding();
        const id = localStorage.getItem(DEVICE_KEY);
        if (token && id) await call('unsubscribe', { deviceId: id }, token);
      } finally {
        await localUnsubscribe();
        close();
      }
    }
    async function restore() {
      const sessionGeneration = generation;
      if (!getToken()) { await disconnect(); return; }
      if (!supported()) { await clearBinding(); return; }
      if (native?.available) {
        const token = getToken();
        const current = await call('state');
        if (sessionGeneration !== generation) return;
        if (await native.check() === 'granted' && current.preferences?.enabled) await native.subscribe((action, data) => call(action, data, token), deviceId());
        else if (native.connected) await native.clear();
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) { await clearBinding(); return; }
      if (getPermission() !== 'granted') {
        await disconnect();
        return;
      }
      const current = await call('state');
      if (current.preferences?.enabled) {
        if (sessionGeneration !== generation) return;
        const result = await call('subscribe', { subscription: subscription.toJSON(), deviceId: deviceId() });
        if (sessionGeneration === generation) registration.active?.postMessage({ type: 'PM_PUSH_BINDING', binding: result.binding || null });
      }
      else await disconnect();
    }
    function close() {
      if (!dialog) return;
      dialog.close();
      dialog.remove();
      dialog = undefined;
      content = undefined;
      feedback = undefined;
      opener?.focus();
    }
    async function open(notificationId) {
      if (dialog) { dialog.focus(); return; }
      await Promise.all([import('./inbox.js?v=20261002'), import('./settings.js?v=20261002')]);
      activeTab = 'recent';
      opener = document.activeElement;
      dialog = element('dialog', undefined, 'pm-notify-dialog');
      dialog.setAttribute('aria-labelledby', 'pm-notify-title');
      const header = element('header', undefined, 'pm-notify-header');
      const title = element('h2', '알림');
      title.id = 'pm-notify-title';
      header.append(title, button('닫기', close, 'pm-notify-button pm-notify-text-button'));
      tabs = element('nav', undefined, 'pm-notify-tabs');
      tabs.setAttribute('aria-label', '알림 화면');
      for (const [key, label] of [['recent', '최근 알림'], ['settings', '알림 설정']]) {
        const tab = button(label, () => { activeTab = key; status(''); render(); }, 'pm-notify-tab');
        tab.dataset.tab = key; tabs.append(tab);
      }
      feedback = element('p', '알림을 불러오는 중입니다.', 'pm-notify-status');
      feedback.setAttribute('role', 'status');
      feedback.setAttribute('aria-live', 'polite');
      content = element('div', undefined, 'pm-notify-content');
      dialog.append(header, tabs, feedback, content);
      dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
      document.body.append(dialog);
      dialog.showModal();
      await perform(async () => { await refresh(); status('');
        if (notificationId) document.getElementById(`pm-notice-${notificationId}`)?.scrollIntoView({ block: 'nearest' });
      });
    }
    function render() {
      if (!content) return;
      for (const tab of tabs.children) tab.setAttribute('aria-current', tab.dataset.tab === activeTab ? 'page' : 'false');
      content.replaceChildren(activeTab === 'recent' ? inbox() : settings());
      if (activeTab === 'settings' && (state.admin || state.canViewLogs)) content.append(admin());
    }
    function settings() {
      return global.PMNotificationSettings.render({ element, button, state, perform, call, refresh,
        status, deviceControls, test: () => perform(async () => {
          if (!supported() || getPermission() !== 'granted' || !state.preferences.enabled || !state.deviceConnected) throw new Error('먼저 이 기기에서 알림을 켜 주세요.');
          await call('test', { deviceId: deviceId() });
          status('발송 요청했어요. 기기에서 실제 수신을 확인해 주세요.');
        }) });
    }
    async function disablePush(allDevices) {
      generation += 1;
      await clearBinding();
      try {
        if (allDevices) await call('preferences', { enabled: false });
        await call('unsubscribe', { deviceId: deviceId() });
      } finally { await localUnsubscribe(); }
      await refresh();
      status(allDevices ? '모든 기기의 푸시 알림을 껐습니다. 알림함은 계속 이용할 수 있어요.' : '이 기기의 알림을 껐습니다. 다른 기기의 알림 설정은 유지됩니다.');
    }
    function deviceControls() {
      const controls = element('div', undefined, 'pm-notify-setting-group');
      const enabled = state.preferences.enabled;
      const turnOff = enabled && state.deviceConnected;
      const row = element('div', undefined, 'pm-notify-setting-row');
      const text = element('div'); text.append(element('strong', '앱 푸시 알림'),
        element('p', turnOff ? '이 기기에 알림이 연결되어 있어요' : getPermission() === 'denied' ? '휴대폰 설정에서 알림을 허용해 주세요' : '예약과 정비 소식을 기기 알림으로 받아요', 'pm-notify-row-description'));
      const toggle = button('', () => perform(async () => {
        if (turnOff) await disablePush(true);
        else { await subscribe(); await refresh(); status('이 기기에 알림이 연결되었어요.'); }
      }), 'pm-notify-switch');
      toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-label', '앱 푸시 알림');
      toggle.setAttribute('aria-checked', String(Boolean(turnOff))); toggle.disabled = !supported() && !turnOff;
      row.append(text, toggle); controls.append(row);
      if (enabled && !state.deviceConnected) controls.append(button('모든 기기의 알림 끄기', () => perform(() => disablePush(true)), 'pm-notify-button pm-notify-text-button'));
      if (state.deviceConnected) controls.append(button('이 기기만 알림 끄기', () => perform(() => disablePush(false)), 'pm-notify-button pm-notify-text-button'));
      return controls;
    }
    function inbox() {
      return global.PMNotificationInbox.render({ items: state.items, preferences: state.preferences,
        labels, element, button, perform, call, refresh, status, close, openTarget });
    }
    function admin() {
      const section = element('section', undefined, 'pm-notify-section');
      section.append(element('h3', '관리자 알림 관리'));
      const log = element('div', undefined, 'pm-notify-delivery');
      section.append(button('발송 기록 조회', () => perform(async () => {
        const response = await call('delivery_log');
        const rows = Array.isArray(response) ? response : response.items || [];
        log.replaceChildren();
        if (!rows.length) log.append(element('p', '발송 기록이 없습니다.'));
        for (const item of rows) {
          const statusLabel = ({ pending: '대기', sending: '발송 중', scheduled: '예약 대기', no_device: '연결된 수신 기기 없음', disabled: '수신 설정 꺼짐', blocked: '수신 권한 없음', expired: '발송 기한 만료', sent: '푸시 서버 접수', failed: '실패', cancelled: '취소' })[item.status] || item.status || '확인 중';
          log.append(element('p', `${item.title || '알림'} · ${statusLabel}${item.error_code ? ` · ${item.error_code}` : ''}`));
        }
        log.append(element('p', '발송 성공은 고객의 수신·읽음 확인과 다릅니다.', 'pm-notify-muted'));
      })), log);
      if (state.admin) section.append(campaign());
      return section;
    }
    function campaign() {
      let requestId = crypto.randomUUID();
      const form = element('form', undefined, 'pm-notify-form');
      form.append(element('h4', '이벤트·혜택 알림 발송'), element('p', '수신에 동의한 고객에게 발송합니다. 발송 권한은 서버에서 확인합니다.', 'pm-notify-muted'));
      const title = element('input');
      title.required = true; title.maxLength = 60;
      const body = element('textarea');
      body.required = true; body.maxLength = 160;
      form.addEventListener('input', () => { requestId = crypto.randomUUID(); });
      for (const [text, input] of [['제목', title], ['내용', body]]) {
        const label = element('label', text); label.append(input); form.append(label);
      }
      const submit = element('button', '동의 고객에게 발송', 'pm-notify-button');
      submit.type = 'submit'; form.append(submit);
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (!title.value.trim() || !body.value.trim()) return;
        if (!global.confirm('작성한 이벤트·혜택 알림을 수신 동의 고객에게 발송할까요?')) return;
        perform(async () => {
          await call('campaigns', { title: title.value.trim(), body: body.value.trim(), requestId });
          form.reset(); requestId = crypto.randomUUID();
          status('이벤트 알림을 발송 대기열에 등록했습니다. 오후 9시부터 오전 8시 사이에는 오전 8시 이후 발송합니다.');
        });
      });
      return form;
    }
    async function enable() {
      await refresh(); await subscribe(); await refresh();
    }
    return { open, disconnect, restore, enable };
  }
  global.PMNotifications = Object.freeze({ create });
})(window);
