(() => {
  'use strict';
  const SEEN = 'pm-permission-intro-v1', PENDING = 'pm-push-opt-in-v1';
  const native = window.PMNativePush;
  const installed = window.Capacitor?.isNativePlatform?.() || navigator.standalone === true
    || ['standalone', 'fullscreen', 'minimal-ui'].some(mode => matchMedia(`(display-mode: ${mode})`).matches)
    || document.referrer.startsWith('android-app://');
  let dialog;
  function node(tag, text, className) {
    const item = document.createElement(tag);
    if (text) item.textContent = text;
    if (className) item.className = className;
    return item;
  }
  function close() {
    localStorage.setItem(SEEN, '1');
    dialog.close(); dialog.remove(); dialog = null;
  }
  async function enable(status, button) {
    button.disabled = true;
    try {
      const supported = native?.available || ('Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator);
      if (!supported) throw new Error('이 환경에서는 기기 알림을 지원하지 않습니다. 앱 안의 알림함을 이용해 주세요.');
      const permission = native?.available ? await native.request() : await Notification.requestPermission();
      if (permission !== 'granted') {
        status.textContent = '알림을 허용하지 않아도 이용할 수 있어요. 나중에 기기 설정에서 변경할 수 있습니다.';
        return;
      }
      localStorage.setItem(PENDING, '1');
      const connected = await window.PMPush.enable();
      status.textContent = connected ? '알림이 연결되었습니다.' : '알림을 허용했습니다. 로그인하면 내 계정에 연결됩니다.';
      button.textContent = '시작하기'; button.onclick = close;
      localStorage.setItem(SEEN, '1');
    } catch (error) {
      status.textContent = error.message || '알림 연결에 실패했습니다. 다시 시도해 주세요.';
    } finally { button.disabled = false; }
  }
  function show() {
    if (dialog) return;
    dialog = node('dialog', null, 'pm-notify-dialog pm-permission-dialog');
    dialog.setAttribute('aria-labelledby', 'pm-permission-title');
    const brand = node('p', '프로모터스', 'pm-permission-brand');
    const title = node('h2', '내 차 소식, 놓치지 마세요'); title.id = 'pm-permission-title';
    const lead = node('p', '정비내역과 진행상황, 예약 알림을 받아보세요.', 'pm-permission-lead');
    const list = node('ul', null, 'pm-permission-list');
    for (const [name, description] of [
      ['알림 · 선택', '예약 접수·변경과 정비 진행 소식을 알려드려요.'],
      ['카메라 · 선택', '차량 사진을 촬영할 때 허용 여부를 물어요.'],
      ['전화 연결', '지점에 연락할 때 전화 앱을 열어요. 별도 권한은 필요 없어요.']
    ]) {
      const row = node('li'); row.append(node('strong', name), node('p', description)); list.append(row);
    }
    const status = node('p', '', 'pm-permission-status'); status.setAttribute('role', 'status');
    const accept = node('button', '알림 켜기', 'pm-notify-button pm-notify-primary'); accept.type = 'button';
    accept.onclick = () => enable(status, accept);
    const later = node('button', '나중에', 'pm-notify-button'); later.type = 'button'; later.onclick = close;
    const note = node('p', '허용하지 않아도 예약과 조회는 이용할 수 있어요.', 'pm-permission-note');
    const actions = node('div', null, 'pm-permission-actions'); actions.append(accept, later);
    dialog.append(brand, title, lead, list, status, actions, note);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    document.body.append(dialog); dialog.showModal();
  }
  // Native camera requests access only after a user chooses a capture input.
  document.addEventListener('click', async event => {
    const input = event.target.closest('input[type="file"][capture]');
    const cap = window.Capacitor;
    if (!input || !cap?.isNativePlatform?.() || !cap.isPluginAvailable('Camera')) return;
    event.preventDefault();
    try {
      const camera = cap.registerPlugin('Camera');
      const photo = await camera.getPhoto({ source: 'CAMERA', resultType: 'uri', quality: 85, saveToGallery: false });
      const blob = await (await fetch(photo.webPath)).blob();
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], `vehicle-${Date.now()}.${photo.format}`, { type: blob.type || `image/${photo.format}` }));
      input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (error) {
      if (!/cancel/i.test(error.message || '')) window.pmAlert?.('카메라를 사용할 수 없습니다. 기기 설정에서 카메라 권한을 확인하거나 사진첩에서 선택해 주세요.');
    }
  }, true);
  window.PMPermissions = { show };
  if (installed && !localStorage.getItem(SEEN)) show();
})();
