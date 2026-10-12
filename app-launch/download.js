const userAgent = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/i.test(userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const destination = isIOS
  ? 'https://apps.apple.com/kr/app/id6810716100'
  : /Android/i.test(userAgent)
    ? 'https://play.google.com/store/apps/details?id=kr.promotors.app'
    : null;
if (destination) {
  document.getElementById('download-status').textContent =
    isIOS ? '앱스토어로 이동하고 있습니다.' : '구글 플레이로 이동하고 있습니다.';
  location.replace(destination);
}
