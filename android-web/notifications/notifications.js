(function (global) {
  'use strict';
  const DEVICE_KEY = 'pm-push-device-v1';
  const labels = { booking: '예약 접수·변경·취소', repair: '정비 진행·사진·출고 안내', reminders: '예약 전날·정기점검 알림', marketing: '이벤트·혜택 알림 (선택)' };
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
    return global.isSecureContext && 'Notification' in global && 'PushManager' in global && 'serviceWorker' in navigator;
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
    if (Notification.permission !== 'default') return Notification.permission;
    let timer;
    try {
      return await Promise.race([
        Notification.requestPermission(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('알림 권한 확인이 지연되고 있습니다. 브라우저 또는 기기 설정에서 알림 권한을 확인한 후 다시 눌러 주세요.')), 20000); })
      ]);
    } finally { clearTimeout(timer); }
  }
  function create({ rpc, getToken, openTarget }) {
    let dialog, content, feedback, busy = false, state, opener, generation = 0;
    async function call(action, data = {}, token = getToken()) {
      if (!token) throw new Error('로그인 후 알림을 이용해 주세요.');
      let result = await rpc('pm_notifications', { p_token: token, p_action: action, p_data: data });
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
      if (supported() && Notification.permission === 'granted') {
        const registration = await navigator.serviceWorker.getRegistration();
        state.deviceConnected = Boolean(await registration?.pushManager?.getSubscription());
      }
      render();
    }
    async function subscribe() {
      const sessionGeneration = generation;
      if (!supported()) throw new Error(unsupportedMessage());
      const permission = await requestPermission();
      if (permission !== 'granted') throw new Error('기기 설정에서 프로모터스 알림을 허용한 후 다시 켜 주세요.');
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
      const registration = await clearBinding();
      const subscription = await registration?.pushManager?.getSubscription();
      if (subscription) await subscription.unsubscribe();
    }
    async function clearBinding() {
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
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) { await clearBinding(); return; }
      if (Notification.permission !== 'granted') {
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
    async function open() {
      if (dialog) { dialog.focus(); return; }
      opener = document.activeElement;
      dialog = element('dialog', undefined, 'pm-notify-dialog');
      dialog.setAttribute('aria-labelledby', 'pm-notify-title');
      const header = element('header', undefined, 'pm-notify-header');
      const title = element('h2', '알림');
      title.id = 'pm-notify-title';
      header.append(title, button('닫기', close));
      feedback = element('p', '알림을 불러오는 중입니다.', 'pm-notify-status');
      feedback.setAttribute('role', 'status');
      feedback.setAttribute('aria-live', 'polite');
      content = element('div', undefined, 'pm-notify-content');
      dialog.append(header, feedback, content);
      dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
      document.body.append(dialog);
      dialog.showModal();
      await perform(async () => { await refresh(); status(''); });
    }
    function render() {
      if (!content) return;
      content.replaceChildren(settings(), inbox());
      if (state.admin || state.canViewLogs) content.append(admin());
    }
    function settings() {
      const section = element('section', undefined, 'pm-notify-section');
      section.append(element('h3', '알림 설정'));
      const permission = !supported() ? unsupportedMessage() : Notification.permission === 'granted' ? '기기 알림이 허용되어 있어요.' : Notification.permission === 'denied' ? '기기 알림이 차단되어 있어요. 기기 또는 브라우저 설정에서 허용해 주세요.' : '알림 켜기를 누르면 기기 알림 권한을 요청해요.';
      section.append(element('p', permission, 'pm-notify-muted'));
      section.append(element('p', '알림을 연결하면 기기 식별값과 푸시 구독 정보를 계정에 연결해 저장합니다. 로그아웃하거나 이 기기의 알림을 끄면 발송 연결이 해제됩니다.', 'pm-notify-muted'));
      section.append(deviceControls());
      for (const [key, label] of Object.entries(labels)) {
        const row = element('label', undefined, 'pm-notify-toggle');
        const input = element('input');
        input.type = 'checkbox';
        input.checked = Boolean(state.preferences[key]);
        input.addEventListener('change', () => {
          if (busy) { input.checked = Boolean(state.preferences[key]); return; }
          const value = input.checked;
          perform(async () => {
            try {
              await call('preferences', { [key]: value });
              state.preferences[key] = value;
              status('알림 설정을 저장했습니다.');
            } catch (error) { input.checked = !value; throw error; }
          });
        });
        row.append(input, element('span', label));
        section.append(row);
      }
      section.append(element('p', '이벤트·혜택 알림은 동의한 경우에만 발송합니다. 언제든 끌 수 있어요.', 'pm-notify-muted'));
      const testButton = button('테스트 알림 보내기', () => perform(async () => {
        if (!supported() || Notification.permission !== 'granted' || !state.preferences.enabled || !state.deviceConnected) throw new Error('먼저 이 기기에서 알림을 켜 주세요.');
        await call('test', { deviceId: deviceId() });
        status('발송 요청했습니다. 잠시 후 기기에서 실제 수신을 확인해 주세요.');
      }));
      testButton.disabled = !supported();
      section.append(testButton);
      section.append(maintenance());
      return section;
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
      const controls = element('div', undefined, 'pm-notify-device-controls');
      const enabled = state.preferences.enabled;
      const connected = state.deviceConnected;
      const turnOff = enabled && connected;
      const toggle = button(turnOff ? '전체 푸시 알림 끄기' : '이 기기에서 알림 켜기', () => perform(async () => {
        if (turnOff) await disablePush(true);
        else { await subscribe(); await refresh(); status('이 기기에 알림이 연결되었습니다.'); }
      }), 'pm-notify-button pm-notify-primary');
      toggle.disabled = !supported() && !turnOff;
      controls.append(toggle);
      if (enabled && !connected) controls.append(button('전체 푸시 알림 끄기', () => perform(() => disablePush(true))));
      if (connected) controls.append(button('이 기기만 알림 끄기', () => perform(() => disablePush(false))));
      return controls;
    }
    function maintenance() {
      const form = element('form', undefined, 'pm-notify-form');
      const label = element('label', '다음 정기점검 알림 날짜');
      const date = element('input');
      date.type = 'date';
      date.required = true;
      const today = new Date();
      date.min = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
      if (state.maintenanceDate) date.value = state.maintenanceDate;
      label.append(date);
      const submit = element('button', '점검 알림 예약', 'pm-notify-button');
      submit.type = 'submit';
      form.append(label, submit);
      form.addEventListener('submit', event => {
        event.preventDefault();
        perform(async () => { await call('maintenance', { date: date.value }); status('점검 알림 날짜를 저장했습니다.'); });
      });
      form.append(button('점검 알림 예약 취소', () => perform(async () => {
        await call('maintenance', { date: null });
        date.value = '';
        status('점검 알림 예약을 취소했습니다.');
      })));
      return form;
    }
    function inbox() {
      const section = element('section', undefined, 'pm-notify-section');
      section.append(element('h3', '알림함'), button('모두 읽음', () => perform(async () => {
        await call('read', { all: true }); await refresh(); status('모두 읽음으로 표시했습니다.');
      })));
      const list = element('ul', undefined, 'pm-notify-list');
      const items = Array.isArray(state.items) ? state.items : [];
      if (!items.length) section.append(element('p', '아직 도착한 알림이 없습니다.', 'pm-notify-muted'));
      for (const item of items) {
        const row = element('li', undefined, item.read_at ? 'pm-notify-item' : 'pm-notify-item pm-notify-unread');
        row.append(element('strong', item.title || '프로모터스 알림'), element('p', item.body || ''));
        const time = new Date(item.created_at);
        row.append(element('small', `${item.read_at ? '읽음' : '읽지 않음'} · ${Number.isNaN(time.getTime()) ? '' : time.toLocaleString('ko-KR')}`));
        row.append(button(item.target ? '내용 확인' : '읽음으로 표시', () => perform(async () => {
          await call('read', { id: item.id });
          if (item.target && openTarget) { close(); await openTarget({ ...item.target, notificationId: item.id }); }
          else await refresh();
        })));
        list.append(row);
      }
      section.append(list);
      return section;
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
