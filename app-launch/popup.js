const stores = {
  ios: 'https://apps.apple.com/kr/app/id6810716100',
  android: 'https://play.google.com/store/apps/details?id=kr.promotors.app'
};
const ua = navigator.userAgent;
const ios = /iPhone|iPad|iPod/i.test(ua) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const platform = ios ? 'ios' : /Android/i.test(ua) ? 'android' : 'desktop';
const installed = () => Boolean(window.Capacitor?.isNativePlatform?.()) ||
  navigator.standalone === true ||
  ['standalone', 'fullscreen', 'minimal-ui'].some(mode => matchMedia(`(display-mode: ${mode})`).matches) ||
  document.referrer.startsWith('android-app://');
function initLaunchPopup() {
  if (installed() || document.getElementById('app-launch')) return;
  const panel = document.createElement('aside');
  panel.id = 'app-launch';
  panel.className = `app-launch app-launch--${platform}`;
  panel.setAttribute('aria-labelledby', 'app-launch-title');
  panel.innerHTML = `
    <button class="app-launch__close" type="button" aria-label="앱 출시 안내 닫기">×</button>
    <a class="app-launch__heading" href="${stores[platform] || '/app-launch/download'}">
      <img class="app-launch__icon" src="/app-launch/icon.png" alt="프로모터스 앱" width="56" height="56">
      <div><p class="app-launch__eyebrow">예약부터 정비 과정까지</p>
      <h2 id="app-launch-title">프로모터스 앱 출시</h2>
      <p class="app-launch__description">간편한 예약부터 사진으로 보는 정비 과정까지.</p></div>
    </a>
    <div class="app-launch__stores">
      <a class="app-launch__qr" href="/app-launch/download" aria-label="QR 하나로 아이폰·갤럭시 앱 다운로드"><img src="/app-launch/download-qr.svg" alt="휴대폰 자동 연결 다운로드 QR" width="96" height="96"></a>
      <div class="app-launch__store-buttons">
        <a class="app-launch__store" data-store="ios" href="${stores.ios}" aria-label="앱스토어에서 프로모터스 받기">
          <img class="app-launch__apple" src="/app-launch/apple-icon.svg" alt="" width="44" height="52">
        </a>
        <a class="app-launch__store" data-store="android" href="${stores.android}" aria-label="구글 플레이에서 프로모터스 받기">
          <span class="app-launch__play" aria-hidden="true"></span>
        </a>
      </div>
    </div>
    <p class="app-launch__scan">QR을 촬영하거나 원하는 스토어를 눌러주세요.</p>`;
  panel.querySelector('.app-launch__close').addEventListener('click', () => panel.remove());
  panel.addEventListener('click', event => {
    if (event.target.closest('a, button')) return;
    if (platform !== 'desktop' || matchMedia('(max-width: 900px)').matches) {
      location.assign(stores[platform] || '/app-launch/download');
    }
  });
  document.body.append(panel);
}
initLaunchPopup();
