/* Visible device/account connection state; permission alone never enables an account. */
export function createConnectionNotice({ api, getToken }) {
  let snapshot = null, busy = false, message = '', revision = 0;
  const cards = new Map();
  const installed = () => window.Capacitor?.isNativePlatform?.() ||
    navigator.standalone || matchMedia('(display-mode: standalone)').matches ||
    matchMedia('(display-mode: fullscreen)').matches || document.referrer.startsWith('android-app://');
  const node = (tag, text, className) => {
    const value = document.createElement(tag);
    if (text) value.textContent = text;
    if (className) value.className = className;
    return value;
  };
  function describe() {
    if (message) return message;
    if (!snapshot) return '알림 연결 상태를 확인하고 있어요.';
    if (!snapshot.supported) return '이 앱에서 알림을 연결할 수 없어요. 스토어에서 최신 버전을 확인해 주세요.';
    if (snapshot.permission === 'denied') return '휴대폰 설정에서 알림을 허용한 뒤 다시 연결해 주세요.';
    if (snapshot.connected) return '이 기기와 계정이 연결됐어요. 설정에서 테스트 알림을 보내 보세요.';
    return snapshot.enabled ? '계정 알림은 켜져 있지만 이 기기가 연결되지 않았어요.' : '예약과 정비 소식을 받으려면 이 기기를 연결해 주세요.';
  }
  function render(card) {
    const heading = snapshot?.connected ? '앱 알림 연결됨' : '앱 알림 연결하기';
    const text = node('div', null, 'pm-push-connection-copy');
    text.append(node('strong', heading), node('p', describe()));
    const actions = node('div', null, 'pm-push-connection-actions');
    const settings = node('button', '알림 설정', 'pm-notify-button');
    settings.type = 'button'; settings.onclick = () => api.open(undefined, 'settings');
    if (snapshot?.supported && !snapshot.connected) {
      const connect = node('button', busy ? '연결 중…' : '이 기기 연결', 'pm-notify-button pm-notify-primary');
      connect.type = 'button'; connect.disabled = busy;
      connect.onclick = connectDevice; actions.append(connect);
    }
    actions.append(settings);
    card.replaceChildren(text, actions);
  }
  function paint() { for (const card of cards.values()) render(card); }
  async function sync() {
    const owner = getToken(), current = ++revision;
    if (!owner) return reset();
    try {
      const result = await api.connection();
      if (current !== revision || owner !== getToken()) return;
      snapshot = result; message = '';
    } catch {
      if (current !== revision || owner !== getToken()) return;
      snapshot = null; message = '연결 상태를 확인하지 못했어요. 알림 설정에서 다시 시도해 주세요.';
    }
    mount(); paint();
  }
  async function connectDevice() {
    if (busy || !getToken()) return;
    const owner = getToken(); busy = true; message = ''; paint();
    try {
      await api.enable();
      if (owner === getToken()) { localStorage.removeItem('pm-push-opt-in-v1'); await sync(); }
    } catch (error) {
      if (owner === getToken()) message = error.message || '알림 연결에 실패했어요. 다시 시도해 주세요.';
    } finally { busy = false; paint(); }
  }
  function reset() {
    revision += 1; snapshot = null; message = ''; busy = false;
    for (const card of cards.values()) card.remove();
    cards.clear();
  }
  function mount() {
    if (!getToken() || !installed()) return;
    for (const [key, anchor] of [
      ['mypage', document.querySelector('.brand-mypage-shell .brand-greeting')],
      ['admin', document.querySelector('#view-adm-book > .intro')]
    ]) {
      if (!anchor || cards.get(key)?.isConnected) continue;
      const card = node('section', null, 'pm-push-connection');
      card.setAttribute('aria-label', '앱 알림 연결 상태');
      card.setAttribute('aria-live', 'polite');
      cards.set(key, card); render(card); anchor.after(card);
    }
  }
  const style = node('link'); style.rel = 'stylesheet';
  style.href = 'notifications/connection.css?v=20261015'; document.head.append(style);
  return { sync, mount, reset };
}
